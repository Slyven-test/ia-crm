#!/usr/bin/env bash
# Script de sauvegarde PostgreSQL pour ia-crm
#
# Cette commande crée une sauvegarde de la base de données PostgreSQL
# nommée dans l'URL DATABASE_URL et place le fichier résultant dans le
# répertoire ./backups. Le fichier est suffixé par la date et l'heure
# d'exécution. Assurez-vous que le répertoire "backups" existe ou sera
# créé avant d'exécuter ce script.

set -euo pipefail

# Créer le dossier de sauvegarde s'il n'existe pas
BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

# Extraire les informations de connexion depuis l'URL DATABASE_URL
# Format attendu : postgresql+psycopg2://user:password@host:port/dbname
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL n'est pas défini dans l'environnement."
  exit 1
fi

# Supprimer le préfixe postgresql+psycopg2://
URL_NO_DRIVER="${DATABASE_URL#postgresql+psycopg2://}"
USER_PASS="${URL_NO_DRIVER%%@*}"
HOST_PORT_DB="${URL_NO_DRIVER#*@}"
DB_HOST_PORT="${HOST_PORT_DB%%/*}"
DB_NAME="${HOST_PORT_DB#*/}"
DB_USER="${USER_PASS%%:*}"
DB_PASS="${USER_PASS#*:}"
DB_HOST="${DB_HOST_PORT%%:*}"
DB_PORT="${DB_HOST_PORT#*:}"

export PGPASSWORD="$DB_PASS"

# Nom du fichier de sauvegarde
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "Sauvegarde de la base $DB_NAME en cours..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -F c -d "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "Sauvegarde terminée : $BACKUP_FILE"