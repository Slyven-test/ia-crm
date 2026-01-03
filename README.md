# ia-crm — Plateforme CRM et recommandation multi‑tenant

Ce dépôt contient l’intégralité du projet « ia‑crm », dérivé des travaux iSaVigne/CRM. Il fournit :

* Un pipeline ETL robuste pour ingérer, transformer et charger les données de plusieurs entreprises (tenants) dans PostgreSQL (dossier `etl/`).
* Un backend API basé sur **FastAPI** pour exposer les données et orchestrer les campagnes (dossier `backend/`).
* Un frontend **React/TypeScript** permettant aux utilisateurs de chaque société de se connecter, consulter leurs recommandations et gérer leurs campagnes (dossier `frontend/`).
* Des scripts de déploiement via Docker Compose pour faciliter la mise en production.

## Structure du dépôt

```
ia-crm/
├── backend/           # API FastAPI
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # Point d’entrée FastAPI
│   │   ├── database.py        # Connexion à PostgreSQL via SQLAlchemy
│   │   ├── models.py          # Modèles SQLAlchemy multi‑tenant
│   │   ├── schemas.py         # Schémas Pydantic
│   │   ├── routers/           # Routes FastAPI (auth, tenants, recommandations, campagnes)
│   │   └── services/          # Services métier (auth, recommandation, Brevo)
│   ├── Dockerfile
│   └── requirements.txt
├── etl/               # Pipeline de chargement des données
│   ├── config.py
│   ├── ingest_raw.py
│   ├── transform_sales.py
│   ├── load_postgres_multi.py
│   ├── main_multi.py
│   └── README.md
├── frontend/          # Interface utilisateur React
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   ├── components/
│   │   └── pages/
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── docker-compose.yml # Orchestration des services (backend, frontend, Postgres)
├── .env.example       # Variables d’environnement pour la configuration
└── LICENSE
```

Pour plus de détails sur chaque composant, consultez les fichiers README dans les sous‑dossiers `backend/`, `etl/` et `frontend/`.

## Démarrage rapide

### Développement local

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd frontend && npm ci && cd ..
cd backend && ENABLE_DEMO_DATA=1 PYTHONPATH=.. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Identifiants de démo : `demo` / `demo`.

Pour exécuter le pipeline ETL avec des données d’exemple (écrit dans `data/demo.db` par défaut) :

```bash
DATABASE_URL=sqlite:///./data/demo.db python -m etl.demo
```

### Docker Compose

```bash
docker compose up --build
```

Le backend est exposé sur le port 8000 et le frontend sur le port 3000. Le `PYTHONPATH`
est configuré automatiquement dans les services pour rendre le module `etl` disponible.

#### Test de fumée API (local, sans Docker)

Pour vérifier rapidement que l’API répond :

```bash
./scripts/api_smoke.sh
```

Le script démarre uvicorn quelques secondes, appelle `/health`, puis arrête le serveur.

#### Test de fumée Docker Compose

Pour vérifier rapidement qu’un environnement Docker fonctionne (build + santé + endpoints clés), exécutez :

```bash
./scripts/compose_smoke.sh
```

Le script :
1. construit les images et démarre la stack en tâche de fond ;
2. attend que Postgres, le backend et le frontend passent en `healthy` ;
3. appelle `/health`, `/docs` et la page d’accueil du frontend ;
4. arrête et supprime les ressources créées (`docker compose down -v`).

## Parcours opérationnel (ingestion → reco → QC → export)

1. **Ingestion** : déposez vos CSV dans `data/<tenant>/raw/` puis lancez l’ingestion ou utilisez les exemples `samples/isavigne`. Le script `etl/ingest_runner.py` écrit les versions staging/curated et produit un rapport dans `data/<tenant>/runs/<run_id>/report.json`.
2. **Run de recommandations** : depuis le backend, appelez `POST /reco/run` (options `top_n`, `silence_window_days`) ou cliquez sur *Lancer un run* dans l’écran *Runs*. Cela génère les tables `reco_output`, `audit_output`, `next_action_output` et un `run_summary`.
3. **QC / gating** : l’écran *QC* affiche les 20 plus faibles `audit_score`, les règles bloquantes (SILENCE_WINDOW, MISSING_EMAIL, OPTOUT_OR_BOUNCE, RECENT_DUPLICATE, UPSELL_NOT_HIGHER, CROSS_SELL_NOT_NEW, LOW_DIVERSITY, SUGAR_MISMATCH) et le taux de gating calculé (`audit_score = 100 - 40·erreurs - 10·warnings`, export autorisé si erreurs=0 et score ≥ 80).
4. **Exports** : téléchargez les fichiers standards via les boutons des écrans *Runs* ou *Exports* ou directement :
   * `/export/runs/{run_id}/reco_output.csv`
   * `/export/runs/{run_id}/audit_output.csv`
   * `/export/runs/{run_id}/next_action_output.csv`
   * `/export/runs/{run_id}/run_summary.json`

## Intégration Brevo (sûre par défaut)

Variables d’environnement (cf. `.env.example`) :
- `BREVO_API_KEY` (secret, **ne jamais logger**)
- `BREVO_DRY_RUN` (défaut `1`, aucun appel réseau)
- `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME`
- `ALLOWED_ORIGINS` pour CORS strict

Endpoints principaux :
- `POST /brevo/sync_contacts` : prépare la synchro de contacts (DRY RUN loggué).
- `POST /brevo/send_batch` : envoie/simule un batch basé sur un `run_id` avec `batch_size` 200-300 et filtrage `gate_export=true`.
- `GET /brevo/logs?run_id=...` : historise chaque action dans `brevo_logs`.

Front (page *Campaigns*) :
- Sélection d’un `run_id`, template, taille lot, boutons **Prepare**/**Send (dry-run/real)**.
- Prévisualisation des 5 premiers contacts et affichage des logs.

Notes :
- Le DRY RUN est activé par défaut en dev ; passez `BREVO_DRY_RUN=0` et renseignez la clé/sender pour un envoi réel.
- Les contacts sont journalisés dans `contact_history` (statut `dry_run` en simulation).

## Architecture overview (rapide)
- **backend** : FastAPI + SQLAlchemy, migrations via Alembic (`backend/alembic.ini`, `backend/migrations`).
- **etl** : scripts pandas multi-tenant, chargement PostgreSQL/SQLite.
- **frontend** : React/Vite, pages métiers (Runs, QC, Campaigns).

## Déploiement rapide (OVH/VPS)
1. Provisionner Postgres + Redis (optionnel) et exporter `DATABASE_URL`.
2. Copier `.env.example` -> `.env` et renseigner secrets (JWT, Brevo, CORS).
3. Construire et lancer : `docker compose up --build` (le backend peut exécuter `alembic upgrade head` avant uvicorn).
4. Placer un reverse proxy (nginx/traefik) devant `backend:8000` et `frontend:3000`, gérer TLS.

## Troubleshooting
- **Health** : `/health` retourne `status` et `db`; vérifier la connectivité DB si `degraded`.
- **Migrations** : exécuter `alembic upgrade head` dans `backend/`.
- **CORS** : vérifier `ALLOWED_ORIGINS` si le frontend ne peut pas appeler l’API.
- **ETL mémoire** : définir `ETL_CHUNK_SIZE` si besoin de traiter des CSV volumineux.
