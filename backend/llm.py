"""A language model for the advisor and the monthly report, on free tiers.

Two providers, tried in order, both through their OpenAI-compatible chat
endpoint so one small HTTP client serves both and no SDK is needed:

  groq    Groq's free tier: fast, generous per-day quota, and prompts are
          not used for training. Default model openai/gpt-oss-120b (Groq
          retired llama-3.3-70b-versatile on 2026-08-16).
  gemini  Google AI Studio's free tier, as the fallback when Groq is out
          of quota or down. On the free tier Google may use prompts to
          improve its models, outside the EU/UK: only aggregated energy
          figures and appliance names are ever sent (never a name, e-mail
          or address), and it only runs when Groq could not answer.

A third, optional provider takes any OpenAI-compatible endpoint
(ENERGIBOX_LLM_URL, ENERGIBOX_LLM_MODEL, ENERGIBOX_LLM_API_KEY) and is
tried last — for instance Ollama on the same server
(http://localhost:11434/v1/chat/completions), free and fully private.

Each provider is enabled by its key (ENERGIBOX_GROQ_API_KEY,
ENERGIBOX_GEMINI_API_KEY) or URL; with none, every caller gets None and falls
back to its own template text, so the app works the same offline — just
less personal.

A provider that answers 429 is left alone until its Retry-After (or a
minute), one that rejects the key for an hour, one that errors for thirty
seconds: free quotas are small, and hammering a provider that already
said no only burns the next minute's quota too.

What comes back is untrusted text. `numbers_are_grounded` checks that a
generated sentence quotes no figure the prompt did not contain, so a
model that invents a saving is caught and the template is used instead.
"""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request

PROVIDERS = [
    {
        "name": "groq",
        "key_env": "ENERGIBOX_GROQ_API_KEY",
        "model_env": "ENERGIBOX_GROQ_MODEL",
        "default_model": "openai/gpt-oss-120b",
        "url": "https://api.groq.com/openai/v1/chat/completions",
    },
    {
        "name": "gemini",
        "key_env": "ENERGIBOX_GEMINI_API_KEY",
        "model_env": "ENERGIBOX_GEMINI_MODEL",
        "default_model": "gemini-2.5-flash",
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    },
]

TIMEOUT_SECONDS = 25
COOLDOWN_RATE_LIMITED = 60
COOLDOWN_AUTH = 3600
COOLDOWN_ERROR = 30

_lock = threading.Lock()
_cooldown_until = {}   # provider name -> monotonic time it may be tried again
_last_used = {"provider": None, "at": None}


def _configured():
    out = []
    for provider in PROVIDERS:
        key = os.environ.get(provider["key_env"], "").strip()
        if key:
            model = os.environ.get(provider["model_env"], "").strip() or provider["default_model"]
            out.append({**provider, "key": key, "model": model})
    url = os.environ.get("ENERGIBOX_LLM_URL", "").strip()
    if url:
        out.append({
            "name": "custom",
            "url": url,
            "key": os.environ.get("ENERGIBOX_LLM_API_KEY", "").strip() or "none",
            "model": os.environ.get("ENERGIBOX_LLM_MODEL", "").strip() or "llama3.1:8b",
        })
    return out


def enabled():
    return bool(_configured())


def status():
    """For /health: which providers are configured, and which are resting."""
    now = time.monotonic()
    return {
        p["name"]: ("cooling_down" if _cooldown_until.get(p["name"], 0) > now else "ready")
        for p in _configured()
    } or "disabled"


def _cool_down(name, seconds):
    with _lock:
        _cooldown_until[name] = time.monotonic() + seconds


def _available(name):
    return _cooldown_until.get(name, 0) <= time.monotonic()


def _request(provider, system, user, max_tokens):
    body = {
        "model": provider["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }
    # gpt-oss thinks before answering; for rewording figures that are
    # already computed, a short think is plenty and saves quota.
    if provider["name"] == "groq" and "gpt-oss" in provider["model"]:
        body["reasoning_effort"] = "low"
    request = urllib.request.Request(
        provider["url"],
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {provider['key']}",
        },
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read())
    return payload["choices"][0]["message"]["content"]


def parse_json(text):
    """The JSON object in a reply, tolerating a ```json fence around it."""
    if not text:
        return None
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(text[start:end + 1])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def complete_json(system, user, max_tokens=1500):
    """Ask the first available provider for a JSON object. Returns the
    parsed dict, or None when no provider could answer usefully."""
    for provider in _configured():
        name = provider["name"]
        if not _available(name):
            continue
        try:
            result = parse_json(_request(provider, system, user, max_tokens))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                try:
                    wait = max(float(retry_after), 1.0)
                except (TypeError, ValueError):
                    wait = COOLDOWN_RATE_LIMITED
                _cool_down(name, wait)
            elif exc.code in (401, 403):
                print(f"llm: {name} rejected the API key ({exc.code})")
                _cool_down(name, COOLDOWN_AUTH)
            else:
                _cool_down(name, COOLDOWN_ERROR)
            continue
        except Exception as exc:  # timeout, DNS, malformed payload
            print(f"llm: {name} failed ({exc!r})")
            _cool_down(name, COOLDOWN_ERROR)
            continue
        if result is not None:
            _last_used.update(provider=name, at=time.time())
            return result
    return None


# ── Guarding against invented figures ───────────────────────────────────

_NUMBER = re.compile(r"\d[\d   ]*(?:[.,]\d+)?")


def _numbers(text):
    """Every figure in a text, as floats: "9 459", "9 459", "1,5"
    and "1.5" all read the way a French or English reader would."""
    found = []
    for match in _NUMBER.findall(text or ""):
        raw = re.sub(r"[   ]", "", match).replace(",", ".")
        # "1.234" with three decimals is a thousands separator in English.
        if re.fullmatch(r"\d{1,3}(\.\d{3})+", raw):
            raw = raw.replace(".", "")
        try:
            found.append(float(raw))
        except ValueError:
            pass
    return found


def numbers_are_grounded(generated, facts, allow_small=True):
    """Whether every figure in `generated` appears in `facts` (rounded as
    the model may round it). Small integers — hours, "3 actions" — are
    allowed when `allow_small` is set."""
    allowed = set()
    for value in _numbers(facts):
        allowed.update({value, round(value), round(value, 1), float(int(value))})
    for value in _numbers(generated):
        if allow_small and value <= 24 and value == int(value):
            continue
        if value in allowed or round(value) in allowed or round(value, 1) in allowed:
            continue
        return False
    return True
