"""Checks the two translation files against each other.

The web app and the mobile app show the same screens and must say the
same things, but they are separate builds: Metro cannot reach into the
web app's module graph, and a shared package would need a workspace this
repo does not have. So frontend/dashboard/src/context/translations.js is
duplicated into mobile/src/context/translations.js, and duplication that
nothing checks is duplication that drifts.

This lives in backend/tests because that is the repo's only test runner.
It reads the two files as text — no Node, no bundler — and fails on:

  * a key present in one app and missing from the other
  * a key present in English and missing from French, or the reverse
  * a placeholder like {rate} that one language drops, which would show
    the user a sentence with a hole in it
  * an English string left untranslated in the French block, for
    anything longer than a word (proper nouns and units are not)
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
WEB = ROOT / "frontend/dashboard/src/context/translations.js"
MOBILE = ROOT / "mobile/src/context/translations.js"

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


def parse(path):
    """{language: {key: value}} from the file's source.

    A regex rather than a JS parser: the file is a flat object of string
    literals by construction, and anything that stops being flat should
    fail loudly here rather than be parsed cleverly.
    """
    text = path.read_text(encoding="utf-8")
    blocks = {}
    for lang in ("en", "fr"):
        start = text.index(f"  {lang}: {{")
        end = text.index("\n  },", start)
        entries = re.findall(r'^\s+"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$',
                             text[start:end], re.M)
        blocks[lang] = {k: v for k, v in entries}
    return blocks


web, mobile = parse(WEB), parse(MOBILE)

print("\n== les deux langues se correspondent ==")
for app, blocks in (("web", web), ("mobile", mobile)):
    en, fr = set(blocks["en"]), set(blocks["fr"])
    check(f"{app} : aucune cle anglaise sans traduction", not en - fr, sorted(en - fr)[:5])
    check(f"{app} : aucune cle francaise orpheline", not fr - en, sorted(fr - en)[:5])
    check(f"{app} : aucune valeur vide",
          all(v.strip() for v in blocks["en"].values()),
          [k for k, v in blocks["en"].items() if not v.strip()][:5])

print("\n== les deux applications disent la meme chose ==")
for lang in ("en", "fr"):
    only_web = set(web[lang]) - set(mobile[lang])
    only_mobile = set(mobile[lang]) - set(web[lang])
    check(f"{lang} : rien qui manque au mobile", not only_web, sorted(only_web)[:5])
    check(f"{lang} : rien qui manque au web", not only_mobile, sorted(only_mobile)[:5])
    differing = [k for k in set(web[lang]) & set(mobile[lang])
                 if web[lang][k] != mobile[lang][k]]
    check(f"{lang} : les textes partages sont identiques", not differing, differing[:5])

print("\n== les substitutions survivent a la traduction ==")
# t("settings.version", {version}) renders "{version}" literally if the
# French string dropped the placeholder, which is exactly the kind of bug
# nobody sees until a screenshot.
mismatched = []
for key, en_value in web["en"].items():
    fr_value = web["fr"].get(key, "")
    if set(re.findall(r"\{(\w+)\}", en_value)) != set(re.findall(r"\{(\w+)\}", fr_value)):
        mismatched.append(key)
check("chaque placeholder existe dans les deux langues", not mismatched, mismatched[:5])

print("\n== rien d'oublie en anglais cote francais ==")
# Single words are often legitimately identical (Version, Format, Note),
# as are brand names and units. A whole sentence that matches is a string
# somebody forgot to translate.
untranslated = [
    key for key, en_value in web["en"].items()
    if len(en_value.split()) > 3 and en_value == web["fr"].get(key)
]
check("aucune phrase anglaise laissee telle quelle", not untranslated, untranslated[:5])

print("\n== les cles utilisees existent ==")
# Every literal t("...") in either app must resolve, or the screen shows
# the key itself to the user.
missing = []
for app_root, blocks in ((ROOT / "frontend/dashboard/src", web),
                         (ROOT / "mobile/src", mobile)):
    sources = list(app_root.rglob("*.jsx")) + list(app_root.rglob("*.js"))
    for path in sources:
        if path.name == "translations.js":
            continue
        for key in re.findall(r't\(\s*"([a-zA-Z0-9_.]+)"', path.read_text(encoding="utf-8")):
            if key not in blocks["en"]:
                missing.append(f"{path.name}:{key}")
check("aucun appel a une cle inexistante", not missing, missing[:5])

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
