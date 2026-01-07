#!/bin/bash
# Script pour exécuter l’ETL multi‑tenant chaque semaine.
#
# Ce script doit être lancé par cron ou systemd timers. Il prend la
# liste des tenants en argument et exécute l’ingestion, la
# transformation et le chargement pour chacun d’entre eux.
# Exemple d’utilisation :
#   bash scripts/weekly_etl.sh ruhlmann valentinr

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 tenant1 [tenant2 ...]"
  exit 1
fi

TENANTS=("$@")
# Active l’environnement virtuel si nécessaire
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

for TENANT in "${TENANTS[@]}"; do
  echo "\n>>> Traitement du tenant $TENANT"
  python etl/main_multi.py --tenant "$TENANT"
done
echo "\nETL terminé pour tous les tenants"
# Met à jour l'état de l'ETL avec la date actuelle
STATE_FILE="${PROJECT_ROOT}/data/etl_state.json"
mkdir -p "$(dirname "$STATE_FILE")"
CURRENT_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat >"$STATE_FILE" <<JSON
{
  "last_run_at": "$CURRENT_TS",
  "results": []
}
JSON