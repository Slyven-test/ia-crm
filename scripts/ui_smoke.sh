#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///./ui-smoke.db}"
export ENABLE_DEMO_DATA="${ENABLE_DEMO_DATA:-1}"
export PYTHONPATH="${PYTHONPATH:-$ROOT_DIR}"
export VITE_API_URL="${VITE_API_URL:-http://localhost:${BACKEND_PORT}}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:${FRONTEND_PORT}}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_url() {
  local url=$1
  for _ in {1..30}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timeout waiting for $url" >&2
  return 1
}

cd "$ROOT_DIR"

# Start backend (FastAPI) with demo data
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --log-level warning &
BACKEND_PID=$!
wait_for_url "http://localhost:${BACKEND_PORT}/health"

# Prepare frontend
cd "$ROOT_DIR/frontend"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build
npx playwright install --with-deps chromium
npm run preview -- --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
wait_for_url "http://localhost:${FRONTEND_PORT}"

BASE_URL="http://localhost:${FRONTEND_PORT}" npm run test:ui-smoke
