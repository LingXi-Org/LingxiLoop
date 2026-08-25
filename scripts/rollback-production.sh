#!/bin/sh
set -eu

compose_file="docker-compose.production.yml"
active_env=".release.env"
previous_env=".release.previous.env"

for required in "$compose_file" "$previous_env" ".env.secrets"; do
  if [ ! -f "$required" ]; then
    echo "Cannot roll back: missing $required" >&2
    exit 2
  fi
done

cp "$previous_env" "$active_env"
docker compose --env-file "$active_env" --env-file .env.secrets -f "$compose_file" pull
docker compose --env-file "$active_env" --env-file .env.secrets -f "$compose_file" up -d --remove-orphans

expected_sha="$(sed -n 's/^LINGXILOOP_COMMIT_SHA=//p' "$active_env")"
attempts=0
while [ "$attempts" -lt 30 ]; do
  if curl -fsS --max-time 10 http://127.0.0.1:5181/api/meta | grep -Fq "\"commitSha\":\"$expected_sha\""; then
    curl -fsS --max-time 10 http://127.0.0.1:5181/api/health >/dev/null
    echo "Rolled back LingxiLoop production to $expected_sha"
    exit 0
  fi
  attempts=$((attempts + 1))
  sleep 4
done

echo "Rollback containers started but did not pass verification" >&2
exit 1
