# ETL – ia‑crm

Ce dossier contient le pipeline d’**Extract‑Transform‑Load** (ETL) multi‑tenant pour la plateforme **ia‑crm**. L’objectif du pipeline est de collecter des fichiers d’exports provenant des systèmes iSaVigne (ou d’autres ERP), de les nettoyer et de les enrichir, puis de les charger dans la base de données PostgreSQL utilisée par l’API FastAPI.

## Étapes principales

1. **Ingestion (`ingest_raw.py`)** : 
   - Scanne le dossier `raw/<tenant_id>/` pour détecter les nouveaux fichiers CSV ou Excel.
   - Copie chaque fichier dans le dossier `staging/<tenant_id>/` en ajoutant un timestamp dans le nom afin d’éviter l’écrasement.
   - Convertit systématiquement les fichiers en CSV pour uniformiser le format.
   - Maintient un fichier `.manifest.json` pour ne pas retraiter les mêmes fichiers à chaque passage.

2. **Transformation (`transform_sales.py`)** : 
   - Lit les fichiers CSV du dossier `staging/<tenant_id>/`.
   - Standardise les noms de colonnes (passage en minuscules, suppression des accents, remplacement des espaces par des underscores).
   - Nettoie certaines colonnes clés : codes clients, dates, références produits.
   - Crée des colonnes dérivées (`document_id`, `product_key`) et ajoute un champ `tenant_id` pour le multi‑tenant.
   - Supprime les doublons puis enregistre un fichier “curated” dans `curated/<tenant_id>/`.

3. **Chargement (`load_postgres_multi.py`)** : 
   - Lit les fichiers du dossier `curated/<tenant_id>/` en lots et les insère dans la base PostgreSQL.
   - S’assure que chaque ligne est associée au bon locataire via la colonne `tenant_id`.
   - Permet, via un paramètre, d’isoler chaque locataire dans son propre schéma si nécessaire.

4. **Orchestration (`main_multi.py`)** :
   - Orchestration complète de l’ETL pour une liste de locataires.
   - Pour chaque tenant, exécute les trois étapes ci‑dessus et produit un résumé du nombre de fichiers et de lignes traités.

## Utilisation

Le pipeline peut être exécuté ponctuellement en ligne de commande ou planifié via un cron/planificateur. Exemple de lancement pour deux locataires :

```bash
python etl/main_multi.py --tenants ruhlmann valentinr --isolate-schema
```

Vous pouvez configurer le chemin racine des données et la connexion à PostgreSQL via les variables d’environnement :

- `DATA_DIR`: chemin vers le répertoire contenant les sous‑dossiers `raw`, `staging` et `curated` de chaque tenant (défaut : `ia-crm/data`).
- `DATABASE_URL`: URL de connexion PostgreSQL (défaut : `postgresql+psycopg2://postgres:postgres@localhost:5432/ia_crm`).

Consultez la documentation des modules pour plus de détails sur leur fonctionnement interne.