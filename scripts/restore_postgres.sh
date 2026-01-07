#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE_NAME="${SERVICE_NAME:-db}"
DB_USER="${DB_USER:-ia_crm}"
DB_NAME="${DB_NAME:-ia_crm}"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/backup.sql" >&2
  exit 1
fi

DUMP_FILE="$1"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "WARNING: this will DROP the current schema in database '$DB_NAME' inside service '$SERVICE_NAME'."
read -r -p "Continue? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Aborted."
  exit 1
fi

echo "==> Dropping public schema"
docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "==> Restoring from $DUMP_FILE"
cat "$DUMP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE_NAME" psql -U "$DB_USER" -d "$DB_NAME"

echo "Restore completed."
