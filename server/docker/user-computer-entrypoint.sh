#!/usr/bin/env bash
set -euo pipefail

# Xvfb is deliberately launched as the unprivileged desktop user. Prepare its
# root-owned UNIX socket directory first, and clear only this container's
# browser-service display lock left behind by a stopped/restarted container.
install -d -o root -g root -m 1777 /tmp/.X11-unix
rm -f /tmp/.X10-lock /tmp/.X11-unix/X10

mkdir -p \
  /home/lingxi/.config/chromium \
  /home/lingxi/shared \
  /home/lingxi/agent-private \
  /workspace \
  /documents \
  /downloads
chown -R lingxi:lingxi /home/lingxi /workspace /documents /downloads

# Screen :10 is the browser-service display. Further agent screens are created
# lazily by AgentScreenManager (:11, :12, ...), each with its own input/VNC
# process but the same persistent filesystem.
runuser -u lingxi -- Xvfb :10 -screen 0 1440x900x24 -nolisten tcp &
runuser -u lingxi -- env DISPLAY=:10 openbox-session &

# Exactly one Chromium process owns the persistent profile. Agents receive
# different CDP targets through BrowserTargetRegistry; they never start another
# process against this user-data-dir. Some managed Docker hosts forbid nested
# user namespaces, so Chromium's own sandbox cannot start there; Docker remains
# the isolation boundary for this dedicated Computer container.
runuser -u lingxi -- env DISPLAY=:10 chromium \
  --no-sandbox \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/lingxi/.config/chromium \
  about:blank &

# Do not report a usable Computer until its singleton browser service is
# reachable. A failed Xvfb/Chromium launch must fail the container rather than
# leaving `sleep infinity` running with no automation capability.
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:9222/json/version >/dev/null; then
    exec sleep infinity
  fi
  sleep 1
done

echo 'Chromium CDP did not become ready on 127.0.0.1:9222' >&2
exit 1
