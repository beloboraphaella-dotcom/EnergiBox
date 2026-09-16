"""Exercise the real auth.py against a fake MySQL, focusing on the
SHA-256 -> bcrypt migration path."""
import hashlib, os, pathlib, sys
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
patch("pymysql.connect", return_value=MagicMock()).start()

import auth

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)

class FakeDB:
    """Records every statement; answers SELECTs from a single user row."""
    lastrowid = 99
    def __init__(self, row): self.row, self.statements, self._next = row, [], None
    def cursor(self): return self
    def execute(self, sql, params=()):
        self.statements.append((" ".join(sql.split()), params))
        self._next = self.row if sql.strip().upper().startswith("SELECT") else None
    def fetchone(self): return self._next
    def commit(self): pass
    def close(self): pass

PW = "correct horse battery"
LEGACY = hashlib.sha256(PW.encode()).hexdigest()

# ── legacy user logs in: authenticates AND gets upgraded ────────────────
db = FakeDB((3, "Ada", "ada@b.co", LEGACY, "owner", 0))
with patch.object(auth, "get_db", return_value=db):
    result, error = auth.login_user("ada@b.co", PW)
check("login accepte un hash SHA-256 existant", error is None and result, error)
check("le token est emis", bool(result and result.get("access_token")))
updates = [s for s in db.statements if s[0].startswith("UPDATE users SET password_hash")]
check("le hash est migre en base apres login", len(updates) == 1, [s[0] for s in db.statements])
if updates:
    new_hash = updates[0][1][0]
    check("le hash ecrit est bien du bcrypt", new_hash.startswith("$2"), new_hash[:12])
    check("l'id cible est le bon", updates[0][1][1] == 3, updates[0][1])
    check("le nouveau hash verifie le mot de passe", auth.verify_password(PW, new_hash))
    check("le nouveau hash rejette un mauvais mot de passe", not auth.verify_password("nope", new_hash))
    check("le nouveau hash tient dans la colonne (<=255)", len(new_hash) <= 255, len(new_hash))

# ── already-migrated user: authenticates, no second UPDATE ──────────────
db2 = FakeDB((3, "Ada", "ada@b.co", auth.hash_password(PW), "owner", 0))
with patch.object(auth, "get_db", return_value=db2):
    result2, error2 = auth.login_user("ada@b.co", PW)
check("login accepte un hash bcrypt", error2 is None and result2, error2)
check("pas de re-migration inutile",
      not [s for s in db2.statements if s[0].startswith("UPDATE users SET password_hash")])

# ── wrong password on a legacy hash: rejected, and NOT upgraded ─────────
db3 = FakeDB((3, "Ada", "ada@b.co", LEGACY, "owner", 0))
with patch.object(auth, "get_db", return_value=db3):
    result3, error3 = auth.login_user("ada@b.co", "wrong")
check("mauvais mot de passe rejete", result3 is None and error3 == "Incorrect password", error3)
check("aucune migration sur echec d'authentification",
      not [s for s in db3.statements if s[0].startswith("UPDATE users SET password_hash")])

# ── suspended legacy user: blocked before any upgrade ───────────────────
db4 = FakeDB((3, "Ada", "ada@b.co", LEGACY, "owner", 1))
with patch.object(auth, "get_db", return_value=db4):
    result4, error4 = auth.login_user("ada@b.co", PW)
check("compte suspendu bloque", result4 is None and "suspended" in (error4 or ""), error4)
check("pas de migration pour un compte suspendu",
      not [s for s in db4.statements if s[0].startswith("UPDATE users SET password_hash")])

# ── change_password from a legacy hash writes bcrypt ────────────────────
db5 = FakeDB((LEGACY,))
with patch.object(auth, "get_db", return_value=db5):
    ok, err = auth.change_password(3, PW, "nouveau-mot-de-passe")
check("changement de mot de passe depuis un hash legacy", ok and err is None, err)
w = [s for s in db5.statements if s[0].startswith("UPDATE users SET password_hash")]
check("le nouveau mot de passe est stocke en bcrypt", w and w[0][1][0].startswith("$2"))
if w: check("il verifie le nouveau mot de passe", auth.verify_password("nouveau-mot-de-passe", w[0][1][0]))

# ── register writes bcrypt, never SHA-256 ───────────────────────────────
db6 = FakeDB(None)
with patch.object(auth, "get_db", return_value=db6):
    auth.register_user("Bob", "bob@b.co", PW)
ins = [s for s in db6.statements if "INSERT INTO users" in s[0]]
check("register stocke un hash bcrypt", ins and ins[0][1][2].startswith("$2"), ins[0][1][2][:12] if ins else None)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
