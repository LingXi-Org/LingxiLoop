#!/bin/sh
# Pod-side `lingxiloop` — a thin curl shim that forwards argv to the lingxiloop
# server's /runtime/cli endpoint. This is what the LLM's `bash` tool
# actually invokes when it runs `lingxiloop reply ...` / `lingxiloop dm ...` /
# etc. inside an agent-computer pod.
#
# The real CLI implementation (runCli in server/src/agents/cli.ts) runs
# on the server — it has the DB connection. The pod just speaks HTTP.
#
# Required env (injected by the orchestrator at pod-spawn time):
#   LINGXILOOP_AGENT_RUNTIME_URL    e.g. http://host.docker.internal:5181/runtime
#   LINGXILOOP_AGENT_RUNTIME_TOKEN  signed JWT pinning agentId + companyId
#
# Output / exit code mirror what `runCli` returned. Network failures
# print an error to stderr and exit 70 (EX_PROTOCOL).
set -eu

: "${LINGXILOOP_AGENT_RUNTIME_URL:?LINGXILOOP_AGENT_RUNTIME_URL not set}"
: "${LINGXILOOP_AGENT_RUNTIME_TOKEN:?LINGXILOOP_AGENT_RUNTIME_TOKEN not set}"

# Build a JSON array of argv from $@. jq --args reads positional args
# and emits them as a JSON string array, handling quote / NL / unicode
# escaping for us — no shell quoting bugs.
ARGV_JSON=$(jq -nc --args '$ARGS.positional' -- "$@" 2>/dev/null) || {
  echo "lingxiloop: failed to encode argv (is jq installed?)" >&2
  exit 70
}

# Capture the body separately from the HTTP status so we can route
# transport errors (network, 5xx) to stderr while still surfacing
# 4xx JSON error bodies to stdout the way an error from runCli would.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
STATUS=$(curl -sS -o "$TMP" -w '%{http_code}' \
  --max-time "${LINGXILOOP_CLI_TIMEOUT:-600}" \
  -H "Authorization: Bearer $LINGXILOOP_AGENT_RUNTIME_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"argv\":$ARGV_JSON}" \
  "$LINGXILOOP_AGENT_RUNTIME_URL/cli") || {
    # curl's own stderr (network errors etc.) already went to fd 2
    # since we didn't redirect it; this catch-all is for the case
    # where the binary itself failed to launch.
    echo "lingxiloop: HTTP request to $LINGXILOOP_AGENT_RUNTIME_URL/cli failed" >&2
    exit 70
  }

if [ "$STATUS" -ge 500 ] || [ -z "$STATUS" ]; then
  echo "lingxiloop: server returned HTTP $STATUS" >&2
  cat "$TMP" >&2 || true
  exit 70
fi

# Parse {text, exitCode} from the response body. If parsing fails the
# server probably returned an unexpected shape — dump it and exit 70.
TEXT=$(jq -er '.text // empty' < "$TMP" 2>/dev/null) || {
  echo "lingxiloop: malformed response from server (HTTP $STATUS):" >&2
  cat "$TMP" >&2
  exit 70
}
CODE=$(jq -er '.exitCode // 1' < "$TMP" 2>/dev/null || echo 1)
SIDE_EFFECTS=$(jq -c '.sideEffects // []' < "$TMP" 2>/dev/null || echo '[]')
# Validate $CODE is an integer in [0,255] — shells truncate larger
# values modulo 256, which would misreport runtime failures.
case "$CODE" in
  ''|*[!0-9]*) CODE=1 ;;
  *) [ "$CODE" -le 255 ] || CODE=1 ;;
esac

SIDE_EFFECT_WRITE_FAILED=0
if [ -n "${LINGXILOOP_CLI_RESULT_PATH:-}" ] && [ "$SIDE_EFFECTS" != "[]" ]; then
  if ! printf '%s\n' "{\"sideEffects\":$SIDE_EFFECTS}" >> "$LINGXILOOP_CLI_RESULT_PATH"; then
    SIDE_EFFECT_WRITE_FAILED=1
    printf '%s%s\n' "__LINGXILOOP_CLI_SIDE_EFFECTS_WRITE_FAILED__=" "$SIDE_EFFECTS" >&2
  fi
fi

# `printf '%s'` (not echo) so a trailing newline in TEXT is preserved
# exactly — `lingxiloop inbox --json` outputs JSON we don't want corrupted.
printf '%s' "$TEXT"
if [ "$SIDE_EFFECT_WRITE_FAILED" -ne 0 ]; then
  exit 70
fi
exit "$CODE"
