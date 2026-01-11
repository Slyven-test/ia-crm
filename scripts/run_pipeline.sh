#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://app.ia-crm.aubach.fr}"
BASE="${BASE%/}"
USER="${USER:-${ADMIN_USERNAME:-admin}}"
PASS="${PASS:-${ADMIN_PASSWORD:-}}"
OUT_DIR="${OUT_DIR:-/opt/ia-crm/out}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-5}"
REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-60}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
POLL_TIMEOUT="${POLL_TIMEOUT:-300}"

log() {
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[$ts] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

cleanup_body() {
  if [[ -n "${API_BODY_FILE:-}" && -f "${API_BODY_FILE}" ]]; then
    rm -f "${API_BODY_FILE}"
  fi
  API_BODY_FILE=""
}

api_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  cleanup_body
  API_BODY_FILE="$(mktemp)"

  local url="$BASE/api/$path"
  local code

  if [[ "$method" == "GET" ]]; then
    code=$(curl -sS -o "$API_BODY_FILE" -w "%{http_code}" \
      --connect-timeout "$CONNECT_TIMEOUT" \
      --max-time "$REQUEST_TIMEOUT" \
      -H "Authorization: Bearer $TOKEN" \
      "$url")
  else
    code=$(curl -sS -o "$API_BODY_FILE" -w "%{http_code}" \
      --connect-timeout "$CONNECT_TIMEOUT" \
      --max-time "$REQUEST_TIMEOUT" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -X "$method" \
      -d "$data" \
      "$url")
  fi

  API_CODE="$code"
  log "$method /api/$path -> $API_CODE"
}

ensure_success() {
  local action="$1"
  local path="$2"

  if [[ "$API_CODE" == "501" ]]; then
    log "Feature off: $path (HTTP 501). Skipping."
    return 1
  fi

  if [[ "$API_CODE" -lt 200 || "$API_CODE" -ge 300 ]]; then
    log "HTTP $API_CODE from $path"
    cat "$API_BODY_FILE" >&2
    die "$action failed"
  fi

  return 0
}

wait_for_completion() {
  local label="$1"
  local deadline=$((SECONDS + POLL_TIMEOUT))

  log "Waiting for $label completion (timeout ${POLL_TIMEOUT}s)..."

  while (( SECONDS < deadline )); do
    api_request GET "audit/latest" ""
    if [[ "$API_CODE" == "501" ]]; then
      log "Feature off: /api/audit/latest (HTTP 501)."
      return 0
    fi

    if [[ "$API_CODE" -ge 200 && "$API_CODE" -lt 300 ]]; then
      if python - <<'PY' < "$API_BODY_FILE"; then
import json
import sys

data = json.load(sys.stdin)
if isinstance(data, list) and len(data) > 0:
    raise SystemExit(0)
raise SystemExit(1)
PY
        log "$label completion detected via /api/audit/latest"
        return 0
      fi
    fi

    sleep "$POLL_INTERVAL"
  done

  die "Timeout while waiting for $label completion"
}

export BASE USER PASS

if [[ -z "$PASS" ]]; then
  die "PASS or ADMIN_PASSWORD is required"
fi

log "Fetching access token"
TOKEN="$(./scripts/get_token.sh)"
if [[ -z "$TOKEN" ]]; then
  die "Empty token"
fi

mkdir -p "$OUT_DIR"

log "Step 1/6: POST /api/rfm/run"
api_request POST "rfm/run" "{}"
if ensure_success "RFM run" "/api/rfm/run"; then
  if [[ "$API_CODE" == "202" ]]; then
    wait_for_completion "RFM"
  fi
fi
cleanup_body

log "Step 2/6: POST /api/recommendations/generate"
api_request POST "recommendations/generate" "{}"
if ensure_success "Recommendations generate" "/api/recommendations/generate"; then
  if [[ "$API_CODE" == "202" ]]; then
    wait_for_completion "Recommendations"
  fi
fi
cleanup_body

log "Step 3/6: GET /api/reco-runs/"
api_request GET "reco-runs/" ""
if ! ensure_success "List reco runs" "/api/reco-runs/"; then
  api_request GET "reco/runs" ""
  ensure_success "List reco runs (fallback)" "/api/reco/runs"
fi

run_info="$(python - <<'PY' < "$API_BODY_FILE")
import json
import sys

data = json.load(sys.stdin)
if not isinstance(data, list) or not data:
    raise SystemExit("No reco runs available")
run = data[0]
run_db_id = run.get("id")
run_id = run.get("run_id") or ""
if run_db_id is None and run_id is None:
    raise SystemExit("Reco run missing identifiers")
print(f"{run_db_id or ''} {run_id}")
PY
)"

read -r RUN_DB_ID RUN_ID <<< "$run_info"

if [[ -z "${RUN_DB_ID:-}" ]]; then
  die "Unable to determine latest reco run id"
fi

if [[ -z "${RUN_ID:-}" ]]; then
  log "run_id missing in reco runs payload; exports will use id=$RUN_DB_ID"
  RUN_ID="$RUN_DB_ID"
fi

cleanup_body

log "Step 4/6: GET /api/reco-runs/${RUN_DB_ID}/items"
api_request GET "reco-runs/${RUN_DB_ID}/items" ""
if ensure_success "Reco items" "/api/reco-runs/${RUN_DB_ID}/items"; then
  ITEM_COUNT="$(python - <<'PY' < "$API_BODY_FILE")
import json
import sys

data = json.load(sys.stdin)
if not isinstance(data, list):
    raise SystemExit("Reco items response is not a list")
print(len(data))
PY
)"

  if [[ "$ITEM_COUNT" -lt 1 ]]; then
    die "No reco items returned for run id ${RUN_DB_ID}"
  fi
else
  log "Skipping reco items verification due to feature flag."
fi

cleanup_body

log "Step 5/6: Download exports to $OUT_DIR"

download_export() {
  local path="$1"
  local filename="$2"
  local tmp_body
  tmp_body="$(mktemp)"

  local code
  code=$(curl -sS -o "$tmp_body" -w "%{http_code}" \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time "$REQUEST_TIMEOUT" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/api/$path")

  if [[ "$code" == "501" ]]; then
    log "Feature off: /api/$path (HTTP 501). Skipping."
    rm -f "$tmp_body"
    return 0
  fi

  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    log "HTTP $code from /api/$path"
    cat "$tmp_body" >&2
    rm -f "$tmp_body"
    die "Download failed"
  fi

  mv "$tmp_body" "$OUT_DIR/$filename"
  log "Saved $OUT_DIR/$filename"
}

download_export "export/runs/${RUN_ID}/run_summary.json" "run_summary_${RUN_ID}.json"
download_export "export/runs/${RUN_ID}/reco_output.csv" "reco_output_${RUN_ID}.csv"
download_export "export/runs/${RUN_ID}/audit_output.csv" "audit_output_${RUN_ID}.csv"
download_export "export/runs/${RUN_ID}/next_action_output.csv" "next_action_${RUN_ID}.csv"

log "Step 6/6: Pipeline completed successfully"
