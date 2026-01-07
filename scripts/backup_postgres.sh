#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ia-crm}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE_NAME="${SERVICE_NAME:-db}"
DB_USER="${DB_USER:-ia_crm}"
DB_NAME="${DB_NAME:-ia_crm}"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Creating backup directory at $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/ia-crm-${STAMP}.sql"

echo "==> Dumping database to $BACKUP_FILE"
if ! docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" >"$BACKUP_FILE"; then
  echo "Backup failed" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "==> Retention: keeping latest 14 dumps"
ls -1t "$BACKUP_DIR"/ia-crm-*.sql 2>/dev/null | tail -n +15 | xargs -r rm --

echo "Backup completed: $BACKUP_FILE"
