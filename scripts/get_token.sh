#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://app.ia-crm.aubach.fr}"
USER="${USER:-admin}"
PASS="${PASS:-}"

if [[ -z "$PASS" ]]; then
  echo "ERROR: PASS is required" >&2
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

code="$(curl -sS -L -o "$tmp" -w "%{http_code}" \
  "$BASE/api/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "scope=")"

if [[ "$code" != "200" ]]; then
  echo "ERROR: HTTP $code from $BASE/api/auth/token" >&2
  echo "Response:" >&2
  cat "$tmp" >&2
  exit 1
fi

token="$(jq -r '.access_token // empty' < "$tmp")"
if [[ -z "$token" ]]; then
  echo "ERROR: Missing access_token in response JSON" >&2
  cat "$tmp" >&2
  exit 1
fi

printf "%s" "$token"
