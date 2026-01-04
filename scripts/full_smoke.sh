#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() {
  echo
  echo "==> $1"
}

step "pytest -q"
cd "$ROOT_DIR"
pytest -q

step "./scripts/api_smoke.sh"
"$ROOT_DIR/scripts/api_smoke.sh"

step "./scripts/ui_smoke.sh"
"$ROOT_DIR/scripts/ui_smoke.sh"

step "./scripts/compose_smoke.sh"
"$ROOT_DIR/scripts/compose_smoke.sh"

echo
echo "✅ Full smoke completed"
