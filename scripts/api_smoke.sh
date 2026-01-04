#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
APP_PATH="${APP_PATH:-backend.app.main:app}"

if ! command -v uvicorn >/dev/null 2>&1; then
  echo "uvicorn is required to run this script" >&2
  exit 1
fi

terminate() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap terminate EXIT

uvicorn "$APP_PATH" --host "$HOST" --port "$PORT" --log-level warning &
SERVER_PID=$!

for _ in {1..10}; do
  if curl --fail "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    echo "API healthcheck OK"
    exit 0
  fi
  sleep 1
done

echo "API did not become ready in time" >&2
exit 1
