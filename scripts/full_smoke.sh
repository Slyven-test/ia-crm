#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() {
  echo
  echo "==> $1"
}

step "./scripts/http_smoke.sh (local)"
BASE_URL="http://127.0.0.1:3000" "$ROOT_DIR/scripts/http_smoke.sh"

step "./scripts/http_smoke.sh (proxy local)"
BASE_URL="https://127.0.0.1" HOST_HEADER="app.ia-crm.aubach.fr" "$ROOT_DIR/scripts/http_smoke.sh"

step "./scripts/http_smoke.sh (public)"
BASE_URL="https://app.ia-crm.aubach.fr" "$ROOT_DIR/scripts/http_smoke.sh"

echo
echo "✅ Full smoke completed"
