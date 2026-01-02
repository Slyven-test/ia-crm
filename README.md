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
cd backend && PYTHONPATH=.. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker Compose

```bash
docker-compose up --build
```

Le backend est exposé sur le port 8000 et le frontend sur le port 3000. Le `PYTHONPATH`
est configuré automatiquement dans les services pour rendre le module `etl` disponible.
