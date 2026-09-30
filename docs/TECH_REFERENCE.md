# EnergiBox — référence technique approfondie

Ce document décrit **chaque technologie de la pile telle qu'elle est utilisée
ici** : ce qu'elle fait, comment elle fonctionne dessous, les pièges qu'un
senior repère tout de suite, et où regarder dans le code. Versions constatées
au 30/09/2026 (installation fraîche depuis les manifestes du dépôt).

| Couche | Technologie | Version installée |
|---|---|---|
| Matériel | ESP32 + pince ampèremétrique + relais | firmware hors dépôt |
| Transport IoT | MQTT 3.1.1, Eclipse Mosquitto, `paho-mqtt` | paho 1.6.1 (`<2.0` imposé) |
| API | FastAPI / Starlette / Uvicorn (ASGI) | 0.142.2 / 1.7.0 / 0.54.0 |
| Validation | Pydantic v2 (cœur Rust `pydantic-core`) | 2.13.5 |
| Données | MySQL 8 / InnoDB, PyMySQL, DBUtils `PooledDB` | PyMySQL 1.2.3, DBUtils 3.2.0 |
| Sécurité | bcrypt, JWT HS256 (`python-jose`) | bcrypt 5.0.0, jose 3.5.0 |
| IA | SDK Anthropic (`claude-haiku-4-5`) | anthropic 1.9.0 |
| Web | React 19.2, Vite 8 (Rolldown), Tailwind 3.4, Recharts 3, axios, oxlint, Vitest 5 | |
| Mobile | Expo SDK 57, React Native 0.86 (New Architecture, Hermes), AsyncStorage | |

---

## 1. Vue d'ensemble et flux de données

```
ESP32 ──publish energibox/<MAC>/consumption {"watts":…} (toutes les 2 s)──▶ Mosquitto
                                                                             │ subscribe energibox/#
                                                                             ▼
                               backend/mqtt_client.py (thread réseau paho)
                               ├─ UPDATE energiboxes.status/last_seen
                               ├─ INSERT readings (watts, timestamp, interval_s)
                               └─ alert_engine.check_spike → runtime.observe → alerts
backend/scheduler.py (thread, tick 30 s)
   ├─ schedules → publish energibox/<MAC>/control "ON"/"OFF"
   ├─ appareils muets > 60 s → offline
   ├─ baselines (15 min), advisor (6 h), purge rate-limit
Clients (web React, mobile Expo) ──HTTP JSON + Bearer JWT──▶ FastAPI (main.py) ──▶ MySQL
```

Trois contextes d'exécution coexistent **dans le même processus** Python :
la boucle asyncio d'Uvicorn (qui délègue les routes `def` à un pool de
threads), le thread réseau de paho, et le thread du scheduler. Tout l'état
partagé en mémoire (`_last_reading_at`, `_open_sessions`, limiteur local) est
donc protégé par des `threading.Lock`. Conséquence d'architecture majeure :
ce design suppose **un seul processus** ; voir §3.6.

---

## 2. Le domaine : mesure d'énergie et tarif ENEO

### 2.1 Puissance, énergie, intégration
- Puissance **P** en watts = débit instantané ; énergie **E** = ∫P dt. 1 kWh = 3 600 000 W·s.
- Le capteur échantillonne P toutes les ~2 s. `backend/energy.py` calcule
  `E ≈ Σ Pᵢ × Δtᵢ` où Δtᵢ est l'écart **mesuré** depuis la mesure précédente
  (colonne `readings.interval_s`, écrite à l'ingestion). C'est une **somme de
  Riemann à gauche/droite** (ici chaque mesure est créditée de l'intervalle
  qui la *précède* : la puissance mesurée à tᵢ est supposée constante sur
  [tᵢ₋₁, tᵢ]).
- **Plafond `MAX_INTERVAL_S = 120`** : au-delà, le trou n'est pas une mesure.
  Choix délibéré de sous-estimer plutôt que d'inventer de la consommation.
- Ancienne formule `SUM(watts)/1000/1800` = hypothèse « 1 800 mesures/heure »,
  fausse dès qu'un boîtier décroche (sous-facturation silencieuse).
- **Puissance moyenne d'un seau** = énergie du seau ÷ durée du seau
  (`energy.avg_watts`), **pas** `AVG(watts)` : `AVG` sur plusieurs appareils
  donne la moyenne *d'un* appareil, pas la charge du foyer.
- À connaître : un vrai compteur mesure la **puissance active** (W), distincte
  de l'apparente (VA) ; un capteur à pince bon marché qui mesure seulement le
  courant suppose cos φ = 1 et surestime les charges inductives (moteurs de
  frigo, climatiseurs). C'est une question de firmware, pas de backend.

### 2.2 Tarif basse tension (Cameroun)
- Barème ARSEL (décision 0096 du 28/05/2012) : 50 FCFA/kWh ≤ 110 kWh, 79 ≤ 400,
  94 ≤ 800, 99 au-delà (résidentiel).
- **Tarification par seuil**, prouvée sur factures (`backend/tariff.py`) : le
  volume total du mois choisit **un seul** tarif appliqué à **tous** les kWh.
  157 kWh → 157 × 79 = 12 403 FCFA (par tranches, ce serait 9 213).
- Conséquences mathématiques exploitées par l'app :
  - la fonction coût est **discontinue** en 110 kWh : passer de 110 à 111 kWh
    coûte 111×79 − 110×50 = **3 269 FCFA** pour 1 kWh ;
  - le coût d'une *part* (jour, semaine, appareil) = part × tarif **du mois**
    (`cost_of_share`), sinon les parts ne se somment pas à la facture ;
  - une économie se calcule **coût(avant) − coût(après)**
    (`saving_from_reduction`), jamais « réduction × tarif » ;
  - une année = somme de 12 factures mensuelles, jamais un volume unique.
- Pas de tarif horaire (heures pleines/creuses) : déplacer une consommation ne
  change rien ; seul le **volume** compte. D'où la refonte de l'advisor.

### 2.3 Détection d'anomalies (`alert_engine.py`, `runtime.py`)
- **Pic** : P > 1,3 × moyenne historique des mesures > 1 W.
- **Durée anormale** : session courante > 2 × durée moyenne apprise. Sessions
  délimitées par le seuil `ON_WATTS = 10`, closes après 120 s de silence ;
  moyenne mobile exponentielle `m ← (1−α)m + αx`, α = 0,25 : horizon
  équivalent ≈ 2/α − 1 = 7 sessions, et les 8 dernières portent ~90 % du
  poids (1 − 0,75⁸).
- **Veille** : consommation > 20 W à une heure historiquement < 5 W.
- Dé-duplication : même type d'alerte, même appareil, < 5 min.

---

## 3. Backend Python

### 3.1 ASGI, Uvicorn, Starlette, FastAPI
- **ASGI** : interface asynchrone serveur ↔ application (successeur de WSGI).
  Une app ASGI est un callable `async (scope, receive, send)`.
- **Uvicorn** : serveur ASGI (boucle `uvloop`, parseur `httptools` avec
  l'extra `[standard]`). `--reload` relance un sous-processus à chaque
  modification ; `--workers N` fork N processus **qui importent chacun
  `main.py`** — donc N clients MQTT et N schedulers ici.
- **Starlette** (1.x) : le micro-framework sous FastAPI (routing, middleware,
  `Request`, `TestClient` basé sur httpx).
- **FastAPI** : couche de déclaration par annotations de type → validation
  Pydantic + génération OpenAPI (`/docs` Swagger UI, `/redoc`).
  - **`def` vs `async def`** : les routes `def` (toutes celles d'EnergiBox)
    s'exécutent dans le **threadpool d'AnyIO** (40 threads par défaut). Un
    appel bloquant (PyMySQL, bcrypt) dans une route `async def` gèlerait la
    boucle entière. Ici le choix `def` est correct car tout l'I/O est bloquant.
  - **Injection de dépendances** (`Depends`) : graphe résolu par requête,
    avec cache par requête. Une dépendance peut déclarer des paramètres de
    chemin/query ; EnergiBox s'en sert pour les contrôles de propriété
    (`get_scoped_user(home_id)`, `get_mac_owner(mac)`, `main.py:273-303`) —
    excellent motif anti-IDOR.
  - `HTTPBearer` : extrait `Authorization: Bearer …`, renvoie 403 (ou 401
    selon version) si absent, et fait apparaître le bouton *Authorize* dans
    Swagger.
  - Paramètres scalaires non déclarés dans le chemin = **query string**.
    D'où `schemas.py` : les secrets passent par un modèle Pydantic → corps JSON.
  - Gestionnaire d'exception personnalisé pour aplatir les 422 en une chaîne
    (`main.py:99-120`).
  - **Cycle de vie** : la pratique actuelle est `lifespan` (context manager
    async passé à `FastAPI(lifespan=...)`) ; les effets de bord à l'import
    (`main.py:85-88`) sont un anti-pattern (tests, workers, reload).
- **CORS** : politique *navigateur* uniquement ; `allow_credentials=True` ne
  concerne que cookies/auth HTTP, inutile avec un Bearer ajouté par JS.

### 3.2 Pydantic v2
- Cœur en Rust (`pydantic-core`) : 5-50× plus rapide que v1.
- API v2 : `field_validator` (+ `@classmethod`), `model_validator`,
  `model_dump()`, `Field(min_length=…)`, `Annotated[...]`, `ConfigDict`.
  v1 utilisait `@validator`, `.dict()`, `class Config`.
- Un `ValueError` levé dans un validateur devient une erreur 422 dont le
  message est préfixé `"Value error, "` (d'où le nettoyage `main.py:112`).
- Pour aller plus loin ici : `EmailStr` (paquet `email-validator`),
  `datetime.time` pour les horaires, `Literal[...]` pour les énumérations,
  `pydantic-settings` pour remplacer le lecteur `.env` maison.

### 3.3 MySQL / InnoDB
- **InnoDB** : moteur transactionnel MVCC, verrouillage de lignes, index
  **B+tree clusterisé sur la clé primaire** ; chaque index secondaire contient
  implicitement la PK. `readings` (PK `BIGINT id`) + index secondaire
  `(monitored_point_id, timestamp)`.
- **Isolation par défaut : REPEATABLE READ** — une transaction lit un
  instantané fixé à sa première lecture. C'est pour ça que `PooledDB(reset=True)`
  fait un `ROLLBACK` au retour d'une connexion : sinon l'emprunteur suivant
  hériterait d'un instantané périmé (`config.py:139-142`).
- **Sargabilité** : `WHERE MONTH(ts)=…`, `DATE(ts)=CURDATE()`, `HOUR(ts)=…`,
  `YEARWEEK(ts)=…` empêchent la *range scan* sur l'index. Toujours écrire
  `ts >= :debut AND ts < :fin`. Vérifier avec `EXPLAIN` / `EXPLAIN ANALYZE`
  (colonnes `type` = `range` vs `ALL`/`index`, `rows`, `Extra`).
- « Dernière mesure par appareil » : `MAX(id) … GROUP BY` sur toute la table
  est O(n). Alternatives : table `latest_reading` en UPSERT
  (`INSERT … ON DUPLICATE KEY UPDATE`), ou `LATERAL`/fenêtre
  `ROW_NUMBER() OVER (PARTITION BY point ORDER BY ts DESC)` (MySQL ≥ 8.0.14).
- **Séries temporelles** : `PARTITION BY RANGE (TO_DAYS(timestamp))` +
  `DROP PARTITION` = purge instantanée ; tables d'agrégats (heure/jour).
- `INSERT … ON DUPLICATE KEY UPDATE` : UPSERT atomique ; les affectations sont
  évaluées **de gauche à droite** (le rate-limiter `rate_limit.py:617` en dépend :
  `attempts` doit voir l'ancien `window_start`).
- Fuseaux : `NOW()` suit `@@session.time_zone` ; `DATETIME` n'a pas de fuseau,
  `TIMESTAMP` est stocké en UTC et converti. Recommandation : tout en UTC.
- `utf8mb4` (vrai UTF-8 4 octets) ; limite d'index 767 octets en format
  COMPACT → `VARCHAR(190)` en utf8mb4 (191×4 > 767), cf. migration 003.
  Avec `ROW_FORMAT=DYNAMIC` (défaut MySQL 8), la limite est 3 072 octets.
- `TIME` est renvoyé par PyMySQL comme `datetime.timedelta` (d'où `_fmt_time`).

### 3.4 PyMySQL et DBUtils
- **PyMySQL** : pilote DB-API 2.0 (PEP 249) 100 % Python. `autocommit=False`
  par défaut → chaque écriture exige `conn.commit()`. Paramètres `%s` = requêtes
  paramétrées (échappement côté client) → pas d'injection SQL. Les f-strings
  SQL d'EnergiBox n'interpolent que des fragments constants (`energy.kwh()`,
  noms de tables en dur, listes de colonnes) — acceptable, mais à surveiller
  en revue.
- **DBUtils `PooledDB`** : pool thread-safe. Réglages ici : `mincached=0`
  (rien ouvert à l'import), `maxcached=POOL_SIZE`, `maxconnections=0` (pas de
  limite dure : pas de blocage, mais pas de protection contre
  `max_connections` MySQL), `ping=1` (vérifie à l'emprunt — MySQL ferme les
  connexions inactives après `wait_timeout`, 8 h par défaut), `reset=True`.
  `close()` rend la connexion au pool.
- Alternative idiomatique : SQLAlchemy 2.x **Core** (`QueuePool`,
  `pool_pre_ping=True`, `pool_recycle`) + Alembic pour les migrations.
  Aujourd'hui SQLAlchemy est installé mais **aucun modèle n'existe** :
  `create_all` ne sert qu'à échouer si MySQL est absent.

### 3.5 MQTT, Mosquitto, paho
- **MQTT** : pub/sub sur TCP via un broker. Topics hiérarchiques ; jokers
  d'abonnement `+` (un niveau) et `#` (tous les niveaux restants).
  Schéma EnergiBox : `energibox/<MAC>/{consumption|status|control}`.
- **QoS** : 0 = au plus une fois ; 1 = au moins une fois (PUBACK, doublons
  possibles) ; 2 = exactement une fois (handshake 4 temps). Les commandes
  de relais mériteraient QoS 1 + idempotence (ON/OFF l'est naturellement).
- **Retained** : le broker garde le dernier message d'un topic pour les
  nouveaux abonnés (utile pour l'état d'un relais).
- **Keepalive** (60 s ici) : PINGREQ/PINGRESP ; si le thread réseau est bloqué
  par des requêtes SQL longues, le broker coupe la session.
- **LWT (Last Will)** : message publié par le broker si le client disparaît —
  la façon standard de détecter qu'un appareil est hors ligne, au lieu d'un
  balayage `last_seen` toutes les 30 s.
- **Clean session / client_id** : `mqtt.Client()` génère un id aléatoire.
  Deux processus abonnés au même topic reçoivent **chacun** tous les messages.
  MQTT v5 offre les **abonnements partagés** `$share/<groupe>/<filtre>`
  (répartition entre membres du groupe), supportés par Mosquitto ≥ 1.6.
- **paho-mqtt 1.x vs 2.x** : la 2.0 (2024) a introduit
  `CallbackAPIVersion` ; `mqtt.Client()` sans argument casse en 2.x. Migration
  rapide : `mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)` ; migration propre :
  `VERSION2` (signatures `on_connect(client, userdata, flags, reason_code,
  properties)`). D'où la borne `<2.0` dans `requirements.txt`.
- `loop_start()` lance un thread réseau ; `connect_async` + `reconnect_delay_set`
  = démarrage tolérant à un broker absent (`mqtt_client.py:174-202`).
- **Mosquitto** : `allow_anonymous false`, `password_file`
  (`mosquitto_passwd`, hash PBKDF2-SHA512), `acl_file` avec `user`/`topic
  read|write|readwrite` et substitutions `%u` (username) / `%c` (client id)
  pour des ACL par appareil. TLS : listener 8883 avec `cafile/certfile/keyfile`,
  éventuellement `require_certificate true` (mTLS, identité = CN du certificat).
- **Côté ESP32** : bibliothèques usuelles PubSubClient (Arduino, QoS 0/1 en
  souscription seulement) ou `esp-mqtt` (ESP-IDF, QoS 0-2, TLS). La
  vérification TLS demande le CA embarqué et une horloge (SNTP) correcte.

### 3.6 Concurrence et déploiement
- GIL : un seul thread exécute du bytecode Python à la fois, mais les appels
  I/O (socket MySQL, MQTT) et bcrypt (C) relâchent le GIL — le modèle
  multi-thread fonctionne pour ce profil I/O-bound.
- Règle d'or pour ce projet : **l'API HTTP est scalable horizontalement, les
  consommateurs MQTT et le scheduler sont des singletons**. Séparer en deux
  processus : `uvicorn main:app --workers N` et un worker d'ingestion unique
  (ou un groupe `$share`). Un scheduler singleton peut s'appuyer sur
  `SELECT GET_LOCK('energibox-scheduler', 0)` dans MySQL.
- Derrière un reverse proxy (Caddy/Nginx/Traefik) : `--proxy-headers
  --forwarded-allow-ips` pour que `request.client.host` soit l'IP réelle.

### 3.7 Authentification
- **bcrypt** : dérivé de Blowfish (EksBlowfish), coût exponentiel `2^rounds`
  (12 ≈ 250 ms), sel 128 bits intégré au hash `$2b$12$<22 car. sel><31 car. hash>`
  (60 caractères). **Tronque à 72 octets** → EnergiBox pré-hache
  `base64(SHA-256(mdp))` (44 octets, sans octet nul — l'octet nul tronque
  aussi) : c'est la construction `bcrypt_sha256` de Passlib. Alternatives
  modernes : **Argon2id** (recommandation OWASP), scrypt.
- Migration de hash à la volée : vérifier l'ancien SHA-256 avec
  `hmac.compare_digest` (comparaison en temps constant), puis ré-hacher en
  bcrypt au premier login réussi (`auth.py`).
- **JWT** (RFC 7519) : `base64url(header).base64url(payload).signature`.
  Signé, **pas chiffré** : le payload (email, rôle) est lisible par tous.
  HS256 = HMAC-SHA256 à clé symétrique (≥ 256 bits d'entropie).
  Claims : `sub` (chaîne !), `exp`, à ajouter `iat`, `iss`, `aud`, `jti`.
  Toujours épingler `algorithms=[...]` au décodage (attaques `alg=none` /
  confusion HS/RS). Révocation : un JWT est valide jusqu'à `exp` ; EnergiBox
  relit le compte en base à chaque requête (`get_current_user`), ce qui rend
  suspension/suppression immédiates ; pour la révocation au changement de mot
  de passe, un `token_version` en base comparé à un claim suffit.
- `python-jose` vs **PyJWT** : la documentation FastAPI est passée à PyJWT ;
  jose a eu CVE-2024-33663 (confusion d'algorithme) et CVE-2024-33664 (DoS
  JWE), corrigées en 3.4.0, et tire `ecdsa`.
- **Rate limiting** : fenêtre fixe (N tentatives par fenêtre démarrant à la
  première) — simple mais permet 2N tentatives à cheval sur deux fenêtres ;
  alternatives : fenêtre glissante (journal ou compteur pondéré), *token
  bucket*. Deux clés indépendantes (IP et email) contre le *credential
  stuffing* et le *password spraying*.

### 3.8 SDK Anthropic
- `anthropic.Anthropic()` lit `ANTHROPIC_API_KEY` ; `client.with_options(
  timeout=6.0, max_retries=1).messages.create(model, max_tokens, system,
  messages)` ; la réponse est une liste de blocs de contenu (`type == "text"`).
- Motif robuste utilisé ici : le LLM **ne fait que reformuler** des chiffres
  calculés de façon déterministe, avec un repli sur un gabarit si l'appel
  échoue. C'est la bonne répartition : les montants ne sortent jamais du
  modèle. Le prompt système interdit d'inventer des chiffres et de conseiller
  un décalage horaire.
- Coût/latence : un appel par suggestion et par foyer toutes les 6 h ; créer
  le client une fois au niveau module et paralléliser (ou regrouper) si le
  nombre de foyers croît.

---

## 4. Frontend web

### 4.1 React 19.2
- Rendu déclaratif, réconciliation par *fiber* ; `StrictMode` en dev double
  le montage des effets pour révéler les effets non idempotents.
- Hooks : `useState`, `useEffect` (synchronisation avec l'extérieur ; retourner
  une fonction de nettoyage — cf. `clearInterval` et le drapeau `cancelled`
  de `Overview.jsx` contre les réponses arrivant après démontage), `useContext`
  (`LanguageContext`). Règle des dépendances : oxlint signale ici des effets
  qui omettent `fetchX` — soit `useCallback`, soit déclarer la fonction dans
  l'effet, soit `useEffectEvent` (stable en 19.2).
- Nouveautés 19.x à connaître : Actions (`useActionState`, `useOptimistic` —
  exactement le besoin du bouton ON/OFF), `use()`, `ref` comme prop, `<Activity>`
  (19.2) pour garder un onglet monté mais caché.
- Pas de routeur : navigation par état (`activeTab`). `react-router-dom` est
  installé sans être utilisé.
- Données serveur : du polling `setInterval` manuel ; l'outillage de référence
  serait TanStack Query (cache, dédoublonnage, `refetchInterval`, pause quand
  l'onglet est caché) ou un flux SSE/WebSocket.

### 4.2 Vite 8
- Depuis Vite 8 (mars 2026), **Rolldown** (bundler Rust, API compatible
  Rollup) remplace le duo esbuild (dev) / Rollup (build). Le dev sert des
  modules ES natifs avec HMR ; le build produit des chunks optimisés.
- `@vitejs/plugin-react` : Fast Refresh. Variables d'env exposées au client :
  préfixe `VITE_` via `import.meta.env` (à utiliser pour l'URL de l'API).
- Découpage : `React.lazy(() => import('./pages/X'))` + `<Suspense>`.

### 4.3 Tailwind CSS 3.4
- Génération *utility-first* à la compilation : le moteur JIT scanne `content`
  et n'émet que les classes trouvées (chaînes **littérales** uniquement : une
  classe construite dynamiquement n'est pas détectée).
- Configuration JS (`tailwind.config.js`) : jetons de couleur au format
  Material 3 (`surface-container-*`, `on-*`), `@tailwindcss/forms`, PostCSS +
  autoprefixer. **Tailwind v4** passe à une configuration CSS-first (`@theme`)
  et à un moteur Rust (Oxide) : migration non triviale, d'où l'épinglage v3.
- `darkMode: "class"` est déclaré mais aucune palette sombre n'existe.

### 4.4 Autres
- **Recharts 3** : graphiques SVG déclaratifs (`ResponsiveContainer`,
  `BarChart`, `LineChart`) ; lourd (d3 sous-jacent) → à charger à la demande.
- **axios** : intercepteurs de réponse (déconnexion forcée sur 401,
  `App.jsx:23-31`). `fetch` natif suffirait.
- **oxlint** : linter Rust de l'écosystème Oxc (VoidZero), compatible avec
  une grande partie des règles ESLint, 50-100× plus rapide.
- **Vitest 5** : runner de tests natif Vite, API compatible Jest.
- **Material Symbols** (police d'icônes Google) et Google Fonts chargées
  depuis le CDN (`index.html`) : dépendance réseau et confidentialité.

---

## 5. Mobile

### 5.1 Expo SDK 57 / React Native 0.86
- SDK 57 embarque RN 0.86 et React 19.2 ; la **New Architecture** est
  obligatoire depuis le SDK 55 : **Fabric** (moteur de rendu C++),
  **TurboModules** (modules natifs chargés à la demande, typés via Codegen),
  **JSI** (appels synchrones JS↔C++ sans le pont JSON de l'ancienne
  architecture).
- **Hermes** : moteur JS compilé en bytecode à la construction (`.hbc`),
  démarrage plus rapide, moins de mémoire.
- `expo start` + Expo Go pour le développement ; `expo prebuild` génère les
  projets natifs ; **EAS Build/Submit/Update** pour les binaires et les mises
  à jour OTA.
- `mobile/AGENTS.md` pointe vers la doc versionnée v57 : les API Expo évoluent
  vite, toujours vérifier la version.
- `expo-constants` : `expoConfig.hostUri` donne l'IP du serveur Metro en dev ;
  `config.js` en déduit l'URL de l'API. En build de production, il n'y a pas
  de `hostUri` : utiliser `app.config.js` + `extra` ou des variables
  `EXPO_PUBLIC_*`.
- **Réseau en clair** : Android bloque `http://` en release depuis l'API 28 ;
  iOS ATS aussi. Prévoir HTTPS.
- **Stockage** : AsyncStorage = clé-valeur non chiffré (SQLite/fichiers).
  Pour un jeton : `expo-secure-store` (Keychain iOS, Keystore Android).
- Polices : `@expo-google-fonts/*` + `useFonts`, rendu bloqué jusqu'au
  chargement (évite le *flash* de police système).
- `react-native-svg` pour les graphiques ; `@react-navigation/*` installé mais
  la navigation est faite à la main (`AppShell`).
- Cycle de vie : `AppState` permet de suspendre le polling en arrière-plan.

---

## 6. Qualité, tests, exploitation

- Tests backend : scripts autonomes qui **stubbent** `pymysql.connect`,
  `sqlalchemy.create_engine`, `start_mqtt`, `start_scheduler`, puis pilotent
  la vraie app via `TestClient`. Rapides et portables, mais ils ne voient
  pas le SQL réel. Étape suivante : pytest + un MySQL jetable (Testcontainers
  ou service GitHub Actions) + `pytest-cov`.
- `test_i18n.py` vérifie que les fichiers de traduction web et mobile sont
  identiques et que chaque clé utilisée existe : bon garde-fou inter-apps.
- Observabilité à ajouter : `logging` structuré (JSON), métriques
  (Prometheus : messages MQTT/s, latence d'ingestion, taille de `readings`),
  `/health` en liveness + readiness séparées.
- Livraison : Docker Compose (mysql:8, eclipse-mosquitto:2, api, worker),
  lockfile Python (`uv lock` ou `pip-tools`), CI qui lance tests + lint +
  build + `pip-audit` + `npm audit`.

---

## 7. Questions qu'un senior se posera (et les réponses)

1. **Pourquoi les routes sont `def` et pas `async def` ?** Parce que tout l'I/O
   (PyMySQL, bcrypt) est bloquant ; `def` les envoie au threadpool, `async def`
   bloquerait la boucle.
2. **Que se passe-t-il avec `--workers 4` ?** Quatre abonnés MQTT et quatre
   schedulers : mesures ×4, commandes ×4. L'ingestion doit être un singleton.
3. **Pourquoi pré-hacher avant bcrypt ?** Limite de 72 octets et octets nuls ;
   SHA-256 + base64 donne 44 octets ASCII.
4. **Pourquoi `reset=True` sur le pool ?** REPEATABLE READ : une transaction
   ouverte par un SELECT fige un instantané qui fuirait vers l'emprunteur
   suivant.
5. **Pourquoi `WHERE MONTH(ts)=…` est lent ?** Fonction sur la colonne → pas
   de *range scan* ; réécrire en bornes semi-ouvertes.
6. **Pourquoi intégrer sur `interval_s` ?** Un boîtier déconnecté ne produit
   pas de lignes ; compter les lignes sous-estime l'énergie.
7. **Pourquoi le prix d'un jour dépend du mois ?** Tarification par seuil : le
   volume mensuel fixe un tarif unique pour tous les kWh.
8. **Comment savoir si un relais a vraiment commuté ?** Aujourd'hui on ne le
   sait pas (QoS 0, `status` ignoré) ; il faut un accusé d'état corrélé.
9. **Comment détecter proprement qu'un ESP32 est hors ligne ?** LWT MQTT
   (+ keepalive), plutôt qu'un balayage `last_seen`.
10. **Comment passer paho en 2.x ?** `Client(CallbackAPIVersion.VERSION2)` et
    nouvelles signatures de callbacks (`reason_code`, `properties`).

---

## Sources
- FastAPI — [discussion sur python-jose / PyJWT](https://github.com/tiangolo/fastapi/discussions/9587)
- [CVE-2024-33663 (python-jose)](https://hol.org/guard/security/cves/CVE-2024-33663-python-jose-through-350-algorithm-confusion-via)
- [Guide de migration paho-mqtt 2.0](https://eclipse.dev/paho/files/paho.mqtt.python/html/migrations.html)
- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57) · [New Architecture (Expo)](https://docs.expo.dev/guides/new-architecture.md)
- [Annonce Vite 8 (Rolldown)](https://vite.dev/blog/announcing-vite8)
- Barème ARSEL : https://arsel-cm.org/tarifs-basse-tension/ (cité dans `backend/tariff.py`)
