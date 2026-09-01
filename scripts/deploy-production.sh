#!/bin/sh
set -eu

compose_file="docker-compose.production.yml"

for required in "$compose_file" ".env.secrets"; do
  if [ ! -f "$required" ]; then
    echo "Missing required production file: $required" >&2
    exit 2
  fi
done

for secret in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL \
  WUKONG_API_TOKEN WUKONG_WEBHOOK_SECRET WUKONG_USER_TOKEN_SECRET \
  AGENT_OS_SERVICE_TOKEN OPENAI_API_KEY OPENAI_BASE_URL OPENAI_MODEL \
  OPENAI_EMBEDDING_MODEL OPEN_NOTEBOOK_PASSWORD OPEN_NOTEBOOK_SURREAL_PASSWORD \
  LINGXILOOP_GATEWAY_HMAC_SECRET LINGXILOOP_INVITE_BASE_URL \
  R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_BASE R2_URL_SIGNING_SECRET; do
  if ! grep -Eq "^${secret}=.+" .env.secrets; then
    echo "Missing required production value: $secret" >&2
    exit 2
  fi
done

compose() {
  docker compose --env-file .env.secrets -f "$compose_file" "$@"
}

configure_r2_cors() {
  echo "Applying and verifying R2 CORS policy"
  compose --profile tools run --rm --no-deps r2-cors
}

verify() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if meta="$(curl -fsS --max-time 10 http://127.0.0.1:5181/api/meta 2>/dev/null)" &&
       printf '%s' "$meta" | grep -Fq '"reasoningRuntime":"agent-os"'; then
      curl -fsS --max-time 10 http://127.0.0.1:5181/api/health >/dev/null
      compose exec -T open-notebook sh -ec \
        'supervisorctl status rag-api | grep -q RUNNING && supervisorctl status rag-worker | grep -q RUNNING && curl -fsS http://localhost:5055/readyz >/dev/null'
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 4
  done
  return 1
}

if ! compose pull ||
   ! configure_r2_cors ||
   ! compose up -d --remove-orphans ||
   ! compose up -d --no-deps --force-recreate agent-os ||
   ! verify ||
   ! compose exec -T -e MVP_SMOKE_CLEANUP=1 -e MVP_SMOKE_SKIP_FAULT_CHECK=1 lingxiloop npx tsx server/scripts/mvp-smoke.ts ||
   ! compose exec -T -e MVP_SMOKE_CLEANUP=1 lingxiloop npx tsx server/scripts/knowledge-rag-smoke.ts; then
  echo "Production deployment failed verification" >&2
  exit 1
fi

compose ps
echo "LingxiLoop production deployment verified"
