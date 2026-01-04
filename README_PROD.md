# Déploiement production — ia-crm.aubach.fr

## Prérequis serveur
- OS Linux avec Docker et Docker Compose (`docker compose` v2+).
- Ports ouverts : **22**, **80**, **443**. Ne pas exposer 5432 (Postgres) ni 6379 (Redis) en public.
- DNS : enregistrez un **A** record `ia-crm.aubach.fr` pointant vers l’IP du serveur.

## Préparation
```bash
git clone https://example.com/ia-crm.git
cd ia-crm
cp .env.prod.example .env.prod
# Éditez .env.prod pour renseigner secrets (JWT, Brevo, etc.)
```

## Lancement stack
```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
# Migrations DB
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

## Vérifications de fumée
```bash
curl -f http://localhost/health
curl -f http://localhost/api/health
```

## Plan de sauvegarde / tâches programmées
- Backup Postgres quotidien (ex. 02:15) via cron :
  `15 2 * * * BACKUP_DIR=/var/backups/ia-crm /opt/ia-crm/scripts/backup_postgres.sh >> /var/log/ia-crm-backup.log 2>&1`
- Pipeline hebdomadaire (ex. dimanche 03:15) :
  `15 3 * * 0 docker compose -f /opt/ia-crm/docker-compose.prod.yml exec backend python -m backend.app.cli.run_pipeline >> /var/log/ia-crm-pipeline.log 2>&1`

## Checklist sécurité
- Accès SSH par clés uniquement, mots de passe désactivés.
- Secrets forts dans `.env.prod` (JWT, Brevo, DB); rotation régulière.
- Aucun service interne (5432, 6379, 8000) exposé publiquement ; seuls 22/80/443 ouverts.

## Notes sécurité
- Caddy est le seul service exposant 80/443. Le backend, Redis et Postgres ne doivent **jamais** être bindés publiquement.
- Activez des mots de passe forts pour la base et conservez les secrets `.env.prod` hors VCS.
