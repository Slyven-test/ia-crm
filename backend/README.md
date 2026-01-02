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
   pip install -r requirements.txt
   # Pour exécuter la suite de tests Python, installez aussi les dépendances de dev
   pip install -r requirements-dev.txt
   ```

2. Configurez les variables d’environnement :

   - `DATABASE_URL`: URL de connexion PostgreSQL (par ex. `postgresql+psycopg2://user:pass@localhost:5432/ia_crm`)
   - `JWT_SECRET_KEY`: clé secrète utilisée pour signer les tokens JWT
   - `BREVO_API_KEY` (optionnel) : clé API pour l’intégration Brevo

   Vous pouvez créer un fichier `.env` à la racine du projet et utiliser
   `python-dotenv` pour charger ces variables automatiquement.

3. Lancez le serveur en développement :

   ```bash
   # Assurez-vous que le dossier racine (qui contient `etl/`) est sur le PYTHONPATH
   PYTHONPATH=.. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   En mode Docker, `docker-compose up --build` utilise désormais le contexte racine et
   définit automatiquement `PYTHONPATH=/app:/app/etl` afin de rendre le module `etl`
   disponible pour les routes correspondantes.

## Points d’extension

- **Gestion des clients, produits et ventes** : à enrichir selon votre
  modèle de données réel (attributs, validations, relations).
- **Moteur de recommandations** : l’implémentation minimale propose une
  recommandation de top produits. Adaptez les algorithmes selon les
  besoins (analyse RFM, scénarios cross‑sell/upsell, règles métier, etc.).
- **Notifications et campagnes** : pour envoyer de vrais e‑mails via Brevo
  ou un autre fournisseur, implémentez les appels API dans
  `services/brevo_service.py` et gérez la planification (scheduler, files
  d’attente). Vous pouvez également intégrer des SMS ou des messages
  push.
