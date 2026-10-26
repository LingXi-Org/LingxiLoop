#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${RELEASE_API_URL:-}" && -n "${RELEASE_API_TOKEN:-}" ]]; then
  exec node --use-env-proxy "$script_dir/run.mjs" "$@"
fi
if [[ ! -f /workspace/.lingxi-production/env.sh ]]; then
  echo '{"status":"preflight-failed","error":"EXISTING_PROVIDER_REQUIRED","productionAccepted":false}' >&2
  exit 1
fi
source /workspace/.lingxi-production/env.sh
exec lingxi-prod run node --use-env-proxy "$script_dir/run.mjs" "$@"
