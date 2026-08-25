#!/bin/sh
set -eu

# Runs on the production host from its configured deployment directory.
# Expected files:
#   docker-compose.production.yml  copied by CI
#   .release.next.env              copied by CI (public metadata + digests)
#   .env.secrets                   pre-provisioned by operators; never by CI

compose_file="docker-compose.production.yml"
next_env=".release.next.env"
active_env=".release.env"
previous_env=".release.previous.env"

for required in "$compose_file" "$next_env" ".env.secrets"; do
  if [ ! -f "$required" ]; then
    echo "Missing required production file: $required" >&2
    exit 2
  fi
done

for secret in OPEN_NOTEBOOK_PASSWORD OPEN_NOTEBOOK_ENCRYPTION_KEY OPEN_NOTEBOOK_SURREAL_PASSWORD; do
  if ! grep -Eq "^${secret}=.+" .env.secrets; then
    echo "Missing required Open Notebook production secret: $secret" >&2
    exit 2
  fi
done
if ! grep -Eq '^OPEN_NOTEBOOK_CHAT_MODEL=.+' .env.secrets &&
   { ! grep -Eq '^OPEN_NOTEBOOK_STRATEGY_MODEL=.+' .env.secrets ||
     ! grep -Eq '^OPEN_NOTEBOOK_ANSWER_MODEL=.+' .env.secrets ||
     ! grep -Eq '^OPEN_NOTEBOOK_FINAL_ANSWER_MODEL=.+' .env.secrets; }; then
  echo "Open Notebook Ask requires OPEN_NOTEBOOK_CHAT_MODEL or all three stage model IDs" >&2
  exit 2
fi

if grep -Eq 'IMAGE=[^@[:space:]]+:[^@[:space:]]+$' "$next_env"; then
  echo "Production images must use immutable image@sha256 digests" >&2
  exit 2
fi
if ! grep -Eq '^LINGXILOOP_SERVER_IMAGE=.+@sha256:[0-9a-f]{64}$' "$next_env" ||
   ! grep -Eq '^AGENT_OS_IMAGE=.+@sha256:[0-9a-f]{64}$' "$next_env" ||
   ! grep -Eq '^WUKONGIM_IMAGE=.+@sha256:[0-9a-f]{64}$' "$next_env" ||
   ! grep -Eq '^OPEN_NOTEBOOK_IMAGE=.+@sha256:[0-9a-f]{64}$' "$next_env"; then
  echo "All four LingxiLoop production images must be digest-pinned" >&2
  exit 2
fi

if [ -f "$active_env" ]; then
  cp "$active_env" "$previous_env"
fi
cp "$next_env" "$active_env"

compose() {
  docker compose --env-file "$active_env" --env-file .env.secrets -f "$compose_file" "$@"
}

verify() {
  expected_sha="$(sed -n 's/^LINGXILOOP_COMMIT_SHA=//p' "$active_env")"
  expected_version="$(sed -n 's/^LINGXILOOP_VERSION=//p' "$active_env")"
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if meta="$(curl -fsS --max-time 10 http://127.0.0.1:5181/api/meta 2>/dev/null)" &&
       printf '%s' "$meta" | grep -Fq "\"commitSha\":\"$expected_sha\"" &&
       printf '%s' "$meta" | grep -Fq "\"version\":\"$expected_version\"" &&
       printf '%s' "$meta" | grep -Fq '"reasoningRuntime":"agent-os"'; then
      curl -fsS --max-time 10 http://127.0.0.1:5181/api/health >/dev/null
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 4
  done
  return 1
}

rollback() {
  if [ ! -f "$previous_env" ]; then
    echo "Deployment failed and no previous image set is available" >&2
    return 1
  fi
  echo "Deployment failed; restoring the previous digest set" >&2
  cp "$previous_env" "$active_env"
  compose pull
  compose up -d --remove-orphans
  verify
}

if ! compose pull ||
   ! compose --profile tools run --rm migrate ||
   ! compose up -d --remove-orphans ||
   ! verify ||
   ! compose exec -T -e MVP_SMOKE_CLEANUP=1 -e MVP_SMOKE_SKIP_FAULT_CHECK=1 lingxiloop npx tsx server/scripts/mvp-smoke.ts; then
  rollback
  exit 1
fi

rm -f "$next_env"
compose ps
echo "LingxiLoop production deployment verified"
