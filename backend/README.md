# Backend – API FastAPI

Ce dossier contient l’API backend de la plateforme **ia‑crm**. L’API est
développée avec [FastAPI](https://fastapi.tiangolo.com/) et expose des
endpoints pour gérer les tenants, les utilisateurs, les clients, les
produits, les ventes, les recommandations et les campagnes e‑mail.

## Caractéristiques principales

- **Multi‑tenant** : chaque enregistrement porte un `tenant_id` qui permet
  d’isoler les données. Les utilisateurs sont rattachés à un tenant et
  ne peuvent accéder qu’à leurs propres données.
- **Authentification JWT** : les utilisateurs s’inscrivent avec un
  identifiant et un mot de passe, et obtiennent un jeton d’accès via
  `/auth/token`. L’accès aux endpoints protégés nécessite ce jeton.
- **Analyse RFM et segmentation** : un service calcule automatiquement
  les composantes Recency, Frequency et Monetary pour chaque client,
  assigne un segment (Champions, Loyal, At Risk, etc.) et met à jour
  leurs profils (panier moyen, budget, préférences de familles). Ces
  données servent de base aux moteurs de recommandations et aux
  dashboards.
- **Préférences et popularité** : la plateforme identifie les familles de
  produits préférées de chaque client et calcule un score de popularité
  global pour chaque produit en fonction de son historique de ventes.
- **Moteur de recommandations avancé** : plusieurs scénarios sont
  implémentés (nurture, winback, rebuy, cross‑sell, upsell). Les
  candidats sont sélectionnés en fonction des préférences du client,
  de son budget, de la popularité des produits et de son score RFM.
- **Analytics et dashboard** : des endpoints fournissent des KPI (nombre
  total de clients, clients actifs, revenu total, panier moyen,
  distribution des segments RFM, tendance des ventes) afin de piloter
  l’activité.
- **Audit de qualité** : un service d’audit vérifie la fraîcheur des
  données, la complétude des e‑mails, la présence de doublons récents
  et la diversité des achats. Un score est attribué et consigné dans un
  journal.
- **Campagnes e‑mail** : un module de campagnes permet de créer des
  campagnes, de sélectionner les destinataires à partir des
  recommandations générées et d’envoyer les messages. L’intégration
  avec Brevo est actuellement simulée via un stub.
- **Séparation claire des responsabilités** : les modèles SQLAlchemy
  représentent les entités en base, les schémas Pydantic valident les
  données en entrée/sortie, et les services encapsulent la logique métier.

## Installation

1. Rendez‑vous dans le dossier `backend/` :

   ```bash
   cd backend
   pip install -r requirements-dev.txt  # inclut l'installation editable de l'ETL
   ```

2. Configurez les variables d’environnement :

   - `DATABASE_URL`: URL de connexion PostgreSQL (par ex. `postgresql+psycopg2://user:pass@localhost:5432/ia_crm`). Si non défini en développement, l’API bascule automatiquement sur SQLite (`sqlite:///./ia_crm_dev.db`).
   - `JWT_SECRET_KEY`: clé secrète utilisée pour signer les tokens JWT
   - `BREVO_API_KEY` (optionnel) : clé API pour l’intégration Brevo (pas de réseau si absente ou DRY RUN)
   - `BREVO_DRY_RUN` (défaut `1`) : bloque tout appel réseau, journalise uniquement
   - `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` : valeurs par défaut pour les envois
   - `BREVO_BASE_URL` (optionnel) : override de l’URL API Brevo (`https://api.brevo.com/v3` par défaut)
   - `ENABLE_DEMO_DATA`: si vrai, crée un tenant + utilisateur `demo/demo` et quelques données
   - `DB_STRICT_STARTUP`: si vrai (`1/true`), échoue immédiatement si la base définie par `DATABASE_URL` est inaccessible (par défaut, l’API démarre en loggant un avertissement)
   - `DATA_DIR`: répertoire racine pour l’ETL (défaut : `./data`)
   - Pipeline reco: `DATABASE_URL` (si absent → SQLite `./data/pipeline.db`), `DATA_DIR` (défaut `./data`)

   Vous pouvez créer un fichier `.env` à la racine du projet et utiliser
   `python-dotenv` pour charger ces variables automatiquement.

3. Lancez le serveur en développement :

   ```bash
   # Assurez-vous que le dossier racine (qui contient `etl/`) est sur le PYTHONPATH
   ENABLE_DEMO_DATA=1 PYTHONPATH=.. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   En mode Docker, `docker-compose up --build` utilise désormais le contexte racine et
   définit automatiquement `PYTHONPATH=/app:/app/etl` afin de rendre le module `etl`
   disponible pour les routes correspondantes.

4. Données de démo : exécutez `python -m etl.demo` (avec `DATABASE_URL` pointant vers
   votre base) pour charger un petit jeu d'essai. Un utilisateur `demo`/`demo` est créé
   si `ENABLE_DEMO_DATA` est activé.

## Pipeline de recommandations en local (sans Postgres)

Une commande unique permet de lancer l’ETL (ingestion → normalisation → chargement), le calcul RFM, les recommandations + audit, puis de générer les exports CSV/JSON, le tout en SQLite par défaut :

```bash
python -m backend.app.cli.run_pipeline
```

Exports écrits dans `./exports/<run_id>/` : `reco_output.csv`, `audit_output.csv`, `next_action_output.csv`, `run_summary.json` (inclut `n_errors`, `n_warns`, `audit_score`, `gate_export`).

## Points d’extension

- **Gestion des clients, produits et ventes** : à enrichir selon votre
  modèle de données réel (attributs, validations, relations).
- **Moteur de recommandations** : l’implémentation minimale propose une
  recommandation de top produits. Adaptez les algorithmes selon les
  besoins (analyse RFM, scénarios cross‑sell/upsell, règles métier, etc.).
- **Notifications et campagnes** : l’intégration Brevo est **safe-by-default** :
  - Par défaut (`BREVO_DRY_RUN=1` ou absence de `BREVO_API_KEY`), aucun appel réseau n’est effectué ; les actions sont simplement journalisées (`brevo_logs`, `contact_history`).
  - Pour activer le mode LIVE, définir `BREVO_DRY_RUN=0` **et** fournir `BREVO_API_KEY`. Un client HTTP réel est alors instancié pour `sync_contacts`/`send_batch`, sinon un stub neutre est utilisé.
  - Workflow recommandé : `sync_contacts` (prépare les contacts) → `send_batch` (prévisualise ou envoie un lot, taille 200–300). Les tests/CI restent offline (aucun trafic sortant).
  - En cas d’erreur HTTP (ex. 429), un backoff/retry minimal est appliqué avant d’échouer proprement.
