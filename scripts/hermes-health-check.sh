#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/hermes-health-check.sh <name> <base-url> [api-key]
  scripts/hermes-health-check.sh --targets-file <file>

Targets file format, one profile per line:
  name|base_url|api_key

Examples:
  scripts/hermes-health-check.sh i-am-ballito http://127.0.0.1:8651 "$API_SERVER_KEY"
  scripts/hermes-health-check.sh --targets-file /etc/hermes/health-targets

The check calls /v1/models first, then /v1/capabilities as fallback.
It sends both X-API-Key and Authorization: Bearer headers when an API key is supplied.
USAGE
}

check_target() {
  local name="$1"
  local base_url="${2%/}"
  local api_key="${3:-}"
  local endpoint status body curl_args

  curl_args=(-fsS --connect-timeout 3 --max-time 10 -H 'Accept: application/json')
  if [[ -n "$api_key" ]]; then
    curl_args+=(-H "X-API-Key: $api_key" -H "Authorization: Bearer $api_key")
  fi

  for endpoint in /v1/models /v1/capabilities; do
    status=0
    body="$(curl "${curl_args[@]}" "$base_url$endpoint" 2>&1)" || status=$?
    if [[ "$status" -eq 0 ]]; then
      printf 'OK %s %s%s\n' "$name" "$base_url" "$endpoint"
      return 0
    fi
  done

  printf 'FAIL %s %s (%s)\n' "$name" "$base_url" "$body" >&2
  return 1
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "$#" -eq 0 ]]; then
    usage
    exit 0
  fi

  local failures=0
  if [[ "${1:-}" == "--targets-file" ]]; then
    local file="${2:-}"
    if [[ -z "$file" || ! -f "$file" ]]; then
      printf 'Targets file not found: %s\n' "$file" >&2
      exit 2
    fi
    while IFS='|' read -r name base_url api_key rest; do
      [[ -z "${name// }" || "${name:0:1}" == '#' ]] && continue
      if [[ -n "${rest:-}" || -z "${base_url:-}" ]]; then
        printf 'Invalid target line for %s; expected name|base_url|api_key\n' "$name" >&2
        failures=$((failures + 1))
        continue
      fi
      check_target "$name" "$base_url" "${api_key:-}" || failures=$((failures + 1))
    done < "$file"
  else
    if [[ "$#" -lt 2 || "$#" -gt 3 ]]; then
      usage >&2
      exit 2
    fi
    check_target "$1" "$2" "${3:-}" || failures=1
  fi

  exit "$failures"
}

main "$@"
