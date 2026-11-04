#!/usr/bin/env bash
set -euo pipefail

# Inventory must succeed before deletion; stopped containers also protect images.
containers=$(docker ps -aq)
used=''
if [ -n "$containers" ]; then
  used=$(docker inspect --format '{{.Image}}' $containers)
fi
inventory=$(docker image ls --no-trunc --format '{{.Repository}}|{{.Tag}}|{{.ID}}')
declare -A counts=() seen=()
while IFS='|' read -r repository tag id; do
  canonical=${repository#accel.way2api.fun/}
  case "$canonical" in
    ghcr.io/lingxi-org/lingxiloop-server|ghcr.io/lingxi-org/lingxiloop-gateway|ghcr.io/lingxi-org/lingxiloop-wukongim|ghcr.io/lingxi-org/lingxiloop-open-notebook) ;;
    *) continue ;;
  esac
  # Docker lists newest first. Keep two distinct tagged images per package.
  if [ "$tag" != '<none>' ] && [ -z "${seen[$canonical:$id]:-}" ]; then
    counts[$canonical]=$(( ${counts[$canonical]:-0} + 1 ))
    seen[$canonical:$id]=${counts[$canonical]}
  fi
  if [ "$tag" != '<none>' ] && [ "${seen[$canonical:$id]}" -le 2 ]; then continue; fi
  if grep -Fxq "$id" <<< "$used"; then continue; fi
  ref=$repository:$tag
  for target in "$@"; do
    if [ "$ref" = "$target" ]; then continue 2; fi
  done
  if [ "$tag" = '<none>' ]; then ref=$id; fi
  # No force: Docker must refuse any image acquired by a container meanwhile.
  docker image rm "$ref"
done <<< "$inventory"
