#!/usr/bin/env bash
# Converge production hosts on the images that scripts/image-tag.mjs names for
# the checked-out commit. Images must already be in GHCR (the deploy workflow
# builds missing ones first).
#
#   deploy/deploy.sh                 # every stack, in dependency order
#   deploy/deploy.sh app-a app-b     # only these stacks
#
# Each stack directory is copied to /opt/lingxiloop/<stack> on its host, beside
# the host-only .env (secrets, never in git) and a generated images.env, then
# `docker compose up -d --wait` converges it. Unchanged stacks are no-ops.
set -euo pipefail
cd "$(dirname "$0")/.."

TXY2=${DEPLOY_TXY2:-root@182.254.156.84} # shanghai-a: PostgreSQL, Redis, WuKongIM, app A
TXY=${DEPLOY_TXY:-root@111.229.65.23}    # shanghai-b: ingress, knowledge, app B + gateway, uptime
declare -A HOST=([core-state]=$TXY2 [app-a]=$TXY2 [ingress]=$TXY [knowledge]=$TXY [app-b]=$TXY [uptime]=$TXY)
ORDER=(core-state ingress knowledge app-a app-b uptime)
REQUESTED=" ${*:-${ORDER[*]}} "
for stack in $REQUESTED; do [[ -n ${HOST[$stack]:-} ]] || { echo "unknown stack: $stack" >&2; exit 2; }; done
# Both app slots always move together (see the Worker barrier below).
[[ $REQUESTED == *" app-"[ab]" "* ]] && REQUESTED+=" app-a app-b "
STACKS=()
for stack in "${ORDER[@]}"; do [[ $REQUESTED == *" $stack "* ]] && STACKS+=("$stack"); done

IMAGES=$(node scripts/image-tag.mjs env)
SERVER_IMAGE=$(sed -n 's/^SERVER_IMAGE=//p' <<<"$IMAGES")
remote() { ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=20 "$@"; }

# Pull each host's images in parallel. ctr fetches from the accelerator directly;
# the Docker daemon's proxied pull path measured >10x slower and can stall.
declare -A REFS=()
for stack in "${STACKS[@]}"; do
  for var in $(grep -o '\${[A-Z]*_IMAGE' "deploy/$stack/compose.yml" | cut -c3- | sort -u); do
    REFS[${HOST[$stack]}]+=" $(sed -n "s/^$var=//p" <<<"$IMAGES")"
  done
done
pids=()
for host in "${!REFS[@]}"; do
  remote "$host" sh -s -- ${REFS[$host]} <<'EOF' &
set -e
for ref; do
  docker image inspect "$ref" >/dev/null 2>&1 && continue
  echo "pull $ref"
  ctr -n moby images pull --platform linux/amd64 "$ref" >/dev/null || ctr -n moby images pull --platform linux/amd64 "$ref" >/dev/null
done
EOF
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done

# A new Web/API may enqueue effect kinds an old Worker would mishandle, so both
# old Workers stop (gracefully, up to their 150s drain) before either slot moves.
if [[ $REQUESTED == *" app-a "* ]]; then
  pids=()
  for slot in a b; do
    host=${HOST[app-$slot]}
    remote "$host" "c=lingxiloop-app-$slot-worker-1; image=\$(docker inspect -f '{{.Config.Image}}' \$c 2>/dev/null || true)
      if [ -n \"\$image\" ] && [ \"\$image\" != '$SERVER_IMAGE' ]; then echo 'stop old worker $slot'; docker stop -t 150 \$c >/dev/null; fi" &
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid"; done
fi

for stack in "${STACKS[@]}"; do
  echo "== $stack -> ${HOST[$stack]}"
  stage=$(mktemp -d)
  cp -R "deploy/$stack/." "$stage"
  printf '%s\n' "$IMAGES" >"$stage/images.env"
  tar -C "$stage" -cf - . | remote "${HOST[$stack]}" "set -e; d=/opt/lingxiloop/$stack; mkdir -p \$d; tar --no-same-owner -C \$d -xf -; cd \$d; touch .env
    docker compose --env-file .env --env-file images.env up -d --wait --wait-timeout 900 --remove-orphans"
  rm -rf "$stage"
done

curl -fsS --retry 10 --retry-delay 3 --retry-all-errors -o /dev/null https://backend.lingxilearn.cn/readyz
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors -o /dev/null https://loop.lingxilearn.cn/
echo "deployed: $(tr '\n' ' ' <<<"$IMAGES")"
