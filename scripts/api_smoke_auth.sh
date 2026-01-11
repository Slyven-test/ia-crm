#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://app.ia-crm.aubach.fr}"
BASE="${BASE%/}"

TOKEN="$(./scripts/get_token.sh)"
if [[ -z "$TOKEN" ]]; then
  echo "Empty token" >&2
  exit 1
fi

fail=0

request_get() {
  local path="$1"
  local tmp_body
  tmp_body="$(mktemp)"
  local code
  code=$(curl -sS -o "$tmp_body" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/api/$path")
  echo "GET /api/$path -> $code"
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    cat "$tmp_body" >&2
    fail=1
  fi
  rm -f "$tmp_body"
}

request_post() {
  local path="$1"
  local tmp_body
  tmp_body="$(mktemp)"
  local code
  code=$(curl -sS -o "$tmp_body" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{}' \
    "$BASE/api/$path")
  local snippet
  snippet=$(head -c 200 "$tmp_body" | tr '\n' ' ')
  echo "POST /api/$path -> $code | ${snippet}"
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    cat "$tmp_body" >&2
    fail=1
  fi
  rm -f "$tmp_body"
}

request_get "products"
request_get "recommendations"
request_get "reco-runs"
request_get "audit/latest"

request_post "recommendations/generate"
request_post "rfm/run"

if [[ "$fail" -ne 0 ]]; then
  echo "Auth smoke failed (401/403)." >&2
  exit 1
fi
