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
- **Moteur de recommandations** : un service de base génère des
  recommandations en fonction des produits les plus populaires chez un
  tenant. Ce moteur est conçu pour être étendu (RFM, co‑achats, règles
  métier, etc.).
- **Intégration Brevo (stub)** : un service d’envoi d’e‑mails simulateur
  permet de tester l’envoi de campagnes sans dépendance externe. Pour
  utiliser Brevo en production, décommentez les appels API et renseignez
  `BREVO_API_KEY` dans `.env`.
- **Séparation claire des responsabilités** : les modèles SQLAlchemy
  représentent les entités en base, les schémas Pydantic valident les
  données en entrée/sortie, et les services encapsulent la logique métier.

## Installation

1. Rendez‑vous dans le dossier `backend/` :

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. Configurez les variables d’environnement :

   - `DATABASE_URL`: URL de connexion PostgreSQL (par ex. `postgresql+psycopg2://user:pass@localhost:5432/ia_crm`)
   - `JWT_SECRET_KEY`: clé secrète utilisée pour signer les tokens JWT
   - `BREVO_API_KEY` (optionnel) : clé API pour l’intégration Brevo

   Vous pouvez créer un fichier `.env` à la racine du projet et utiliser
   `python-dotenv` pour charger ces variables automatiquement.

3. Lancez le serveur en développement :

   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

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