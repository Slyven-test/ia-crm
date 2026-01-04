#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ia-crm-smoke}"

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: Docker not installed; skipping compose smoke." >&2
  exit 0
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME")

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}

on_exit() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    printf '\n❌ Smoke test failed; showing recent logs...\n' >&2
    "${COMPOSE[@]}" logs --tail=200 || true
  fi
  cleanup
  exit "$exit_code"
}
trap 'on_exit' EXIT

wait_for_service() {
  local service=$1
  local attempts=${2:-30}
  local sleep_seconds=${3:-5}

  for _ in $(seq 1 "$attempts"); do
    local container_id
    container_id=$("${COMPOSE[@]}" ps -q "$service" || true)
    if [[ -n "$container_id" ]]; then
      local status
      status=$(docker inspect -f '{{.State.Health.Status}}' "$container_id" 2>/dev/null || true)
      if [[ "$status" == "healthy" ]]; then
        echo "✅ $service is healthy"
        return 0
      fi
    fi
    sleep "$sleep_seconds"
  done

  echo "Service $service did not become healthy in time" >&2
  return 1
}

pushd "$ROOT_DIR" >/dev/null

# Ensure a clean slate before starting
cleanup

echo "Building and starting docker-compose stack..."
"${COMPOSE[@]}" up --build -d

wait_for_service db
wait_for_service backend
wait_for_service frontend 24 5

printf '\nPinging backend health endpoint...\n'
curl --fail --retry 5 --retry-delay 2 http://localhost:8000/health

printf '\nPinging backend docs...\n'
curl --fail --retry 5 --retry-delay 2 http://localhost:8000/docs -o /dev/null

printf '\nFetching frontend landing page...\n'
curl --fail --retry 5 --retry-delay 2 http://localhost:3000 -o /dev/null

popd >/dev/null

printf '\nSmoke test succeeded\n'
