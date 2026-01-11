#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
HOST_HEADER="${HOST_HEADER:-}"
ATTEMPTS="${ATTEMPTS:-30}"
SLEEP_SECONDS="${SLEEP_SECONDS:-1}"
INSECURE="${INSECURE:-}"

if [[ -z "$BASE_URL" ]]; then
  echo "BASE_URL is required (ex: https://app.ia-crm.aubach.fr)" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"

ROUTES=(
  /api/health
  /login
  /imports
  /customers
  /products
  /campaigns
  /recommendations
  /runs
  /exports
)

curl_opts=(-sS --max-time 3 -o /dev/null -w "%{http_code}")
if [[ -n "$HOST_HEADER" ]]; then
  curl_opts+=(-H "Host: ${HOST_HEADER}")
fi
if [[ "$INSECURE" == "1" ]]; then
  curl_opts+=(-k)
fi

for route in "${ROUTES[@]}"; do
  ok=0
  echo "Checking ${BASE_URL}${route}"
  for ((i = 1; i <= ATTEMPTS; i++)); do
    code="$(curl "${curl_opts[@]}" "${BASE_URL}${route}" || true)"
    if [[ -z "$code" ]]; then
      code="000"
    fi
    echo "  attempt ${i}/${ATTEMPTS}: HTTP ${code}"
    if [[ "$code" == "200" || "$code" == "302" || "$code" == "307" ]]; then
      ok=1
      break
    fi
    sleep "$SLEEP_SECONDS"
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "Route ${route} failed after ${ATTEMPTS} attempts" >&2
    exit 1
  fi
done

echo "All HTTP smoke checks passed for ${BASE_URL}"
