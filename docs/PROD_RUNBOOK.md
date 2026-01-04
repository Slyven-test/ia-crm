# Runbook production — ia-crm.aubach.fr (VPS Ubuntu 24.04)

## DNS et réseau
- `ia-crm.aubach.fr` → A record vers **51.77.145.201**
- Ports à ouvrir : **22**, **80**, **443** uniquement.
- Ne jamais exposer 5432/6379/8000 en public.

## Bootstrap serveur
```bash
sudo bash scripts/bootstrap_vps_ubuntu.sh
```
Installe Docker/Compose, UFW (22/80/443), fail2ban, utilisateur `iacrm`, dossiers `/opt/ia-crm`, `/var/lib/ia-crm/data`, `/var/backups/ia-crm`.

## Déploiement applicatif
```bash
sudo -u iacrm -i
cd /opt/ia-crm
git clone https://example.com/ia-crm.git .
cp .env.prod.example .env.prod   # renseigner secrets
./scripts/deploy.sh
```

## Vérifications
```bash
curl -f https://ia-crm.aubach.fr/health
curl -f https://ia-crm.aubach.fr/api/health
```

## Sauvegardes et tâches planifiées (cron)
- Backup Postgres quotidien (02:15) :
  `15 2 * * * BACKUP_DIR=/var/backups/ia-crm /opt/ia-crm/scripts/backup_postgres.sh >> /var/log/ia-crm-backup.log 2>&1`
- Pipeline hebdomadaire (dimanche 03:15) :
  `15 3 * * 0 docker compose -f /opt/ia-crm/docker-compose.prod.yml exec backend python -m backend.app.cli.run_pipeline >> /var/log/ia-crm-pipeline.log 2>&1`

## Restauration Postgres
```bash
./scripts/restore_postgres.sh /var/backups/ia-crm/ia-crm-YYYYMMDD-HHMMSS.sql
```

## Sécurité de base
- SSH par clés uniquement ; désactiver l’authentification par mot de passe.
- Secrets forts dans `.env.prod`, rotation régulière.
- Vérifier UFW (`ufw status numbered`) et fail2ban (`systemctl status fail2ban`).
- Ne jamais exposer directement les services internes (db/redis/backend).
