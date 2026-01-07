#!/usr/bin/env bash
# Script de restauration PostgreSQL pour ia-crm
#
# Cette commande restaure une base à partir d'une sauvegarde réalisée avec
# le script backup.sh. Elle écrase la base de données existante. Ne
# l'utilisez qu'en connaissance de cause.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <fichier_de_sauvegarde.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Fichier de sauvegarde introuvable : $BACKUP_FILE"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL n'est pas défini dans l'environnement."
  exit 1
fi

# Extraire les informations de connexion depuis l'URL DATABASE_URL
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

echo "Restauration de la base $DB_NAME depuis $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists
echo "Restauration terminée."