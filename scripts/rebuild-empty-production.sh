#!/bin/sh
set -eu
umask 077

# Destructive first deployment for an environment that has never held user data.
# Native v1 has no migration path: this command is valid only before the
# environment contains user or business data.

compose_file="docker-compose.production.yml"
active_env=".release.env"
next_env=".release.next.env"
secrets_env=".env.secrets"
lock_dir=".empty-production-rebuild.lock"
knowledge_prefix="knowledge-sources/"

[ "${EMPTY_PRODUCTION_REBUILD_CONFIRM:-}" = "ERASE-EMPTY-PRODUCTION" ] || {
  echo "Set EMPTY_PRODUCTION_REBUILD_CONFIRM=ERASE-EMPTY-PRODUCTION to continue" >&2
  exit 2
}

for required in "$compose_file" "$next_env" "$secrets_env"; do
  [ -f "$required" ] || { echo "Missing required production file: $required" >&2; exit 2; }
done
for command_name in docker aws sed grep; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is not installed: $command_name" >&2
    exit 2
  }
done
docker compose version >/dev/null

mkdir "$lock_dir" 2>/dev/null || {
  echo "Another production rebuild is active ($lock_dir exists)" >&2
  exit 2
}
cleanup_lock() { rmdir "$lock_dir" 2>/dev/null || true; }
trap cleanup_lock EXIT HUP INT TERM

read_env_value() {
  key=$1
  file=$2
  value=$(sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r')
  case "$value" in
    \"*\") value=${value#\"}; value=${value%\"} ;;
    \'*\') value=${value#\'}; value=${value%\'} ;;
  esac
  printf '%s' "$value"
}

require_env_value() {
  value=$(read_env_value "$1" "$2")
  [ -n "$value" ] || { echo "Missing required value $1 in $2" >&2; exit 2; }
  printf '%s' "$value"
}

validate_prefix() {
  label=$1
  prefix=$2
  case "$prefix" in
    ""|/|/*|*..*|*//*|*\\*|*[!A-Za-z0-9._/-]*)
      echo "$label is not a safe relative object prefix: $prefix" >&2
      exit 2
      ;;
  esac
  case "$prefix" in */) ;; *) prefix="${prefix}/" ;; esac
  [ "$prefix" != "$knowledge_prefix" ] || {
    echo "$label must not equal $knowledge_prefix" >&2
    exit 2
  }
  printf '%s' "$prefix"
}

for image_key in LINGXILOOP_SERVER_IMAGE AGENT_OS_IMAGE WUKONGIM_IMAGE OPEN_NOTEBOOK_IMAGE; do
  image=$(require_env_value "$image_key" "$next_env")
  printf '%s\n' "$image" | grep -Eq '^.+@sha256:[0-9a-f]{64}$' || {
    echo "$image_key must be digest-pinned in $next_env" >&2
    exit 2
  }
done

compose_env=$next_env
if [ -f "$active_env" ]; then
  compose_env=$active_env
fi
compose() {
  docker compose --project-directory "$(pwd -P)" \
    --env-file "$compose_env" --env-file "$secrets_env" -f "$compose_file" "$@"
}

# Refuse to apply the empty-environment path when the running PostgreSQL
# instance contains any product identity, conversation, Agent, or knowledge
# data. A non-empty deployment belongs on the paired cutover path.
postgres_id=$(compose ps -q postgres 2>/dev/null || true)
if [ -n "$postgres_id" ]; then
  postgres_user=$(read_env_value POSTGRES_USER "$secrets_env")
  postgres_db=$(read_env_value POSTGRES_DB "$secrets_env")
  [ -n "$postgres_user" ] || postgres_user=lingxiloop
  [ -n "$postgres_db" ] || postgres_db=lingxiloop
  persisted_rows=$(compose exec -T postgres psql -X -A -t -U "$postgres_user" -d "$postgres_db" \
    -v ON_ERROR_STOP=1 -c \
    "SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM companies) +
            (SELECT count(*) FROM conversations) + (SELECT count(*) FROM agent_work_items) +
            (SELECT count(*) FROM knowledge_sources);" | tr -d '[:space:]')
  case "$persisted_rows" in
    ''|*[!0-9]*) echo "Could not prove that PostgreSQL is empty" >&2; exit 2 ;;
    0) ;;
    *) echo "Refusing empty rebuild: PostgreSQL contains $persisted_rows protected rows" >&2; exit 2 ;;
  esac
fi

r2_endpoint=$(require_env_value R2_ENDPOINT "$secrets_env")
r2_bucket=$(require_env_value R2_BUCKET "$secrets_env")
AWS_ACCESS_KEY_ID=$(require_env_value R2_ACCESS_KEY_ID "$secrets_env")
AWS_SECRET_ACCESS_KEY=$(require_env_value R2_SECRET_ACCESS_KEY "$secrets_env")
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
export AWS_EC2_METADATA_DISABLED=true AWS_DEFAULT_REGION=auto AWS_REGION=auto
open_notebook_prefix=$(read_env_value OPEN_NOTEBOOK_R2_PREFIX "$secrets_env")
[ -n "$open_notebook_prefix" ] || open_notebook_prefix=$(read_env_value OPEN_NOTEBOOK_R2_PREFIX "$next_env")
[ -n "$open_notebook_prefix" ] || open_notebook_prefix=open-notebook
open_notebook_prefix=$(validate_prefix OPEN_NOTEBOOK_R2_PREFIX "$open_notebook_prefix")
case "$open_notebook_prefix" in
  "$knowledge_prefix"*) echo "R2 prefixes overlap" >&2; exit 2 ;;
esac
case "$knowledge_prefix" in
  "$open_notebook_prefix"*) echo "R2 prefixes overlap" >&2; exit 2 ;;
esac

echo "Stopping the empty production stack before destructive cleanup"
compose down --remove-orphans

echo "Erasing only the two knowledge object prefixes"
aws --endpoint-url "$r2_endpoint" s3 rm "s3://${r2_bucket}/${knowledge_prefix}" --recursive --only-show-errors
aws --endpoint-url "$r2_endpoint" s3 rm "s3://${r2_bucket}/${open_notebook_prefix}" --recursive --only-show-errors

echo "Removing the empty production containers and named data volumes"
for logical_name in \
  postgres-data redis-data wukong-data agent-os-data \
  open-notebook-surreal-data open-notebook-data; do
  volumes=$(docker volume ls -q \
    --filter label=com.docker.compose.project=lingxiloop \
    --filter "label=com.docker.compose.volume=${logical_name}")
  for volume_name in $volumes; do
    labels=$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.volume"}}' "$volume_name")
    [ "$labels" = "lingxiloop|$logical_name" ] || {
      echo "Refusing unexpected Docker volume $volume_name ($labels)" >&2
      exit 2
    }
    docker volume rm "$volume_name" >/dev/null
  done
done

cp "$next_env" "$active_env"
rm -f .release.previous.env .knowledge-plane-native-v1
compose_env=$active_env

# The ordinary production gate now bootstraps the empty canonical PostgreSQL
# schema, the embedding contract, both runtimes, and the
# public upload-to-retrieval smoke.
sh ./scripts/deploy-production.sh

printf 'mode=empty-production-rebuild\nimage=%s\ncompleted_at=%s\n' \
  "$(require_env_value OPEN_NOTEBOOK_IMAGE "$active_env")" \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > .knowledge-plane-native-v1
echo "Empty production environment rebuilt on the RAG-only release."
