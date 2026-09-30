"""Covers the language model client (Groq, then Gemini), the guard against
invented figures, the advisor's bilingual phrasing, the local forecast and
anomaly detection, and the monthly report."""
import io, json, os, pathlib, sys, urllib.error
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

with patch("sqlalchemy.create_engine", return_value=MagicMock()), \
     patch("pymysql.connect", return_value=MagicMock()), \
     patch("mqtt_client.start_mqtt", return_value=MagicMock()), \
     patch("leader.start", return_value=MagicMock()), \
     patch("scheduler.start_scheduler", return_value=MagicMock()):
    import main
import ai_advisor, auth, bilingual, insights, llm, reports, tariff
from fastapi.testclient import TestClient

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


def reply(content):
    body = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
    response = MagicMock()
    response.read.return_value = body
    response.__enter__ = lambda self: self
    response.__exit__ = lambda self, *a: False
    return response


def http_error(code, retry_after=None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return urllib.error.HTTPError("u", code, "x", headers, io.BytesIO(b""))


KEYS = {"ENERGIBOX_GROQ_API_KEY": "g", "ENERGIBOX_GEMINI_API_KEY": "m"}

# ── Provider chain ──────────────────────────────────────────────────────
print("\n== fournisseurs ==")
with patch.dict(os.environ, {}, clear=False):
    for key in KEYS:
        os.environ.pop(key, None)
    check("sans cle, l'IA est desactivee", not llm.enabled() and llm.complete_json("s", "u") is None)

llm._cooldown_until.clear()
calls = []
def fake_urlopen(request, timeout):
    calls.append(request.full_url)
    if "groq" in request.full_url:
        raise http_error(429, "120")
    return reply('```json\n{"ok": true}\n```')

with patch.dict(os.environ, KEYS), patch("urllib.request.urlopen", side_effect=fake_urlopen):
    first = llm.complete_json("s", "u")
    second = llm.complete_json("s", "u")
    groq_state = llm.status()["groq"]
check("Groq sature : Gemini prend le relais", first == {"ok": True}, first)
check("Groq est essaye en premier", "groq" in calls[0])
check("Groq en pause n'est pas re-sollicite", sum("groq" in c for c in calls) == 1, calls)
check("et reste en pause le temps demande", groq_state == "cooling_down")

llm._cooldown_until.clear()
sent = {}
def capture(request, timeout):
    sent.update(json.loads(request.data))
    sent["auth"] = request.headers.get("Authorization")
    return reply('{"a": 1}')
with patch.dict(os.environ, KEYS), patch("urllib.request.urlopen", side_effect=capture):
    llm.complete_json("sys", "user")
check("modele Groq par defaut : gpt-oss-120b", sent.get("model") == "openai/gpt-oss-120b", sent.get("model"))
check("reponse en JSON demandee", sent.get("response_format") == {"type": "json_object"})
check("cle envoyee en Bearer", sent.get("auth") == "Bearer g")

llm._cooldown_until.clear()
with patch.dict(os.environ, KEYS), patch("urllib.request.urlopen", side_effect=TimeoutError()):
    check("tout en panne : None, sans exception", llm.complete_json("s", "u") is None)
llm._cooldown_until.clear()

check("JSON extrait d'un texte bavard", llm.parse_json('Voici : {"x": 2} merci') == {"x": 2})
check("texte sans JSON : None", llm.parse_json("pas de json") is None)

# ── Invented figures ────────────────────────────────────────────────────
print("\n== chiffres inventes ==")
facts = "Saving: 4770 FCFA\nProjected: 130 kWh\nShare: 45%"
check("chiffres repris : accepte", llm.numbers_are_grounded("Economisez 4 770 FCFA sur 130 kWh (45 %).", facts))
check("separateur insecable francais compris", llm.numbers_are_grounded("4 770 FCFA", facts))
check("chiffre invente : refuse", not llm.numbers_are_grounded("Economisez 9 000 FCFA.", facts))
check("petits entiers (heures) toleres", llm.numbers_are_grounded("apres 22 h, 3 gestes", facts))

# ── Advisor phrasing ────────────────────────────────────────────────────
print("\n== conseils rediges par l'IA ==")
def tips():
    return [{
        "kind": "dominant", "monitored_point_id": 1,
        "suggestion_text": "Clim alone is 45% of this month's consumption. Cutting its use by a tenth would save about 426 FCFA.",
        "suggestion_text_fr": "Clim représente 45 % de la consommation. Réduire son usage d'un dixième économiserait environ 426 FCFA.",
        "facts": "Appliance: Clim\nShare: 45%\nSaving if its use drops by 10%: 426 FCFA",
        "estimated_saving_fcfa": 426,
    }]

good = {"items": [{"id": "0",
                   "en": "Your Clim makes up 45% of the month: using it a tenth less saves about 426 FCFA.",
                   "fr": "Votre Clim pèse 45 % du mois : l'utiliser un dixième de moins vous fait gagner environ 426 FCFA."}]}
with patch.object(llm, "enabled", return_value=True), patch.object(llm, "complete_json", return_value=good):
    out = ai_advisor.phrase_suggestions(tips())
check("texte de l'IA retenu en anglais", out[0]["suggestion_text"].startswith("Your Clim"))
check("et en francais", out[0]["suggestion_text_fr"].startswith("Votre Clim"))
check("marque comme ecrit par l'IA", out[0].get("ai_written") is True)

bad = {"items": [{"id": "0", "en": "Save 5000 FCFA every month with your Clim now!",
                  "fr": "Economisez 5000 FCFA chaque mois avec votre Clim !"}]}
with patch.object(llm, "enabled", return_value=True), patch.object(llm, "complete_json", return_value=bad):
    out = ai_advisor.phrase_suggestions(tips())
check("chiffre invente par l'IA : modele conserve", out[0]["suggestion_text"].startswith("Clim alone"))
check("et pas marque IA", not out[0].get("ai_written"))

with patch.object(llm, "enabled", return_value=True), \
     patch.object(llm, "complete_json", return_value={"items": [{"id": "0", "en": "Your Clim is 45%, saving 426 FCFA if cut."}]}):
    out = ai_advisor.phrase_suggestions(tips())
check("une seule langue fournie : modele conserve", out[0]["suggestion_text"].startswith("Clim alone"))

# ── Forecast ────────────────────────────────────────────────────────────
print("\n== prevision ==")
now = datetime(2026, 9, 15, 12, 0)
# 8 weeks: weekdays 4 kWh, Saturdays 10, Sundays 8.
history = {}
for i in range(1, 57):
    d = now.date() - timedelta(days=i)
    history[d] = 10.0 if d.weekday() == 5 else 8.0 if d.weekday() == 6 else 4.0
mtd = sum(v for d, v in history.items() if d.month == 9) + 2.0
f = insights.forecast_from_daily(history, mtd, now)
expected_rest = 2.0 + sum(10.0 if (now.date() + timedelta(days=k)).weekday() == 5
                          else 8.0 if (now.date() + timedelta(days=k)).weekday() == 6 else 4.0
                          for k in range(1, 16))
check("profil de la semaine appris", f["method"] == "weekday_profile", f["method"])
check("projection proche du calendrier reel", abs(f["kwh"] - (mtd + expected_rest)) < 1.5,
      (f["kwh"], mtd + expected_rest))
check("cout calcule au tarif", f["fcfa"] == round(tariff.monthly_cost(f["kwh"])))
check("fourchette encadre la projection", f["low_fcfa"] <= f["fcfa"] <= f["high_fcfa"])

short = {now.date() - timedelta(days=i): 5.0 for i in range(1, 4)}
lin = insights.forecast_from_daily(short, 70.0, now)
check("moins d'une semaine : projection lineaire, sans fourchette",
      lin["method"] == "linear" and lin["low_fcfa"] is None)

risky = insights.forecast_from_daily(history, mtd, now, budget_fcfa=round(tariff.monthly_cost(f["kwh"]) * 0.7))
safe = insights.forecast_from_daily(history, mtd, now, budget_fcfa=round(tariff.monthly_cost(f["kwh"]) * 2))
check("budget trop bas : risque eleve", risky["budget_risk"] >= 0.9, risky["budget_risk"])
check("budget large : risque faible", safe["budget_risk"] <= 0.1, safe["budget_risk"])
check("kWh du budget : le cout n'y depasse pas le budget",
      tariff.monthly_cost(insights.kwh_for_budget(9000)) <= 9000)

# ── Anomalies ───────────────────────────────────────────────────────────
print("\n== anomalies ==")
fridge = [1.2, 1.3, 1.25, 1.1, 1.3, 1.2, 1.15, 1.25, 1.3, 1.2, 1.1, 1.2, 1.3, 1.25, 1.2]
check("journee normale : rien", insights.detect_anomaly(fridge, 1.3) is None)
check("journee trois fois plus forte : haute", insights.detect_anomaly(fridge, 3.8) == "high")
check("refrigerateur presque arrete : basse", insights.detect_anomaly(fridge, 0.1) == "low")
check("historique trop court : rien", insights.detect_anomaly(fridge[:5], 9.0) is None)
tv = [0.05] * 20
check("appareil minuscule : pas d'alerte pour quelques Wh", insights.detect_anomaly(tv, 0.3) is None)
en, fr = insights.anomaly_messages("high", "Clim", 9.5, 3.1)
check("message francais a la virgule", "9,5 kWh" in fr and "3,1 kWh" in fr, fr)

# ── Monthly report ──────────────────────────────────────────────────────
print("\n== bilan mensuel ==")
facts = {"year": 2026, "month": 8, "is_current_month": False, "kwh": 130.4, "cost_fcfa": 10302,
         "previous_kwh": 110.0, "previous_cost_fcfa": 5500, "change_pct": 19,
         "top_appliances": [{"name": "Clim", "kwh": 58.7, "share_pct": 45, "previous_kwh": 40.0}],
         "alerts": [{"type": "spike", "count": 2, "appliances": ["Clim"]}],
         "budget_fcfa": None, "forecast": None}
t = reports.template_report(facts)
check("modele : resume francais", "août 2026" in t["fr"]["summary"] and "130,4 kWh" in t["fr"]["summary"], t["fr"]["summary"])
check("modele : trois actions", len(t["en"]["actions"]) == 3 and len(t["fr"]["actions"]) == 3)
check("modele : chiffres tous issus des faits",
      llm.numbers_are_grounded(t["en"]["summary"], json.dumps(facts)))

ai_reply = {"en": {"summary": "In August 2026 you used 130.4 kWh, about 10302 FCFA, 19% more than July. Clim made up 45% of it.",
                   "actions": ["Use Clim a little less.", "Check Clim, which raised alerts.", "Set a monthly budget."]},
            "fr": {"summary": "En août 2026, vous avez consommé 130,4 kWh, soit environ 10 302 FCFA, 19 % de plus qu'en juillet. La Clim en représente 45 %.",
                   "actions": ["Utilisez un peu moins la Clim.", "Vérifiez la Clim, qui a déclenché des alertes.", "Fixez un budget mensuel."]}}
with patch.object(llm, "enabled", return_value=True), patch.object(llm, "complete_json", return_value=ai_reply):
    content, source = reports.write_report(facts)
check("bilan ecrit par l'IA retenu", source == "ai" and content["fr"]["summary"].startswith("En août"))

invented = json.loads(json.dumps(ai_reply)); invented["fr"]["summary"] += " Vous économiserez 3 000 FCFA."
with patch.object(llm, "enabled", return_value=True), patch.object(llm, "complete_json", return_value=invented):
    content, source = reports.write_report(facts)
check("bilan avec chiffre invente : modele de secours", source == "template")

# ── Language of the API ────────────────────────────────────────────────
print("\n== langue ==")
check("fr-FR -> fr", bilingual.language_of("fr-FR,fr;q=0.9") == "fr")
check("vide -> en", bilingual.language_of("") == "en")
check("francais absent : repli anglais", bilingual.pick("fr", "Hello", None) == "Hello")

client = TestClient(main.app, raise_server_exceptions=False)
headers = {"Authorization": f"Bearer {auth.create_access_token(1, 'a@b.co')}", "Accept-Language": "fr"}
fake = {"facts": facts, "content": t, "source": "template", "generated_at": "2026-09-01T00:00:00"}
with patch.object(main, "get_account_status", return_value=("a@b.co", "owner", False)), \
     patch.object(main, "_verify_home_ownership", return_value=None), \
     patch.object(reports, "monthly_report", return_value=fake):
    r = client.get("/reports/monthly?home_id=1&year=2026&month=8", headers=headers)
    future = client.get("/reports/monthly?home_id=1&year=2099&month=1", headers=headers)
check("bilan servi en francais", r.status_code == 200 and r.json()["summary"] == t["fr"]["summary"], r.text[:120])
check("mois futur refuse", future.status_code == 400)

print(f"\n{'OK' if not fails else 'ECHECS: ' + str(len(fails))}")
sys.exit(1 if fails else 0)
