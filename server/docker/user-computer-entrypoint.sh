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
getent group lingxi-shared >/dev/null || groupadd lingxi-shared
usermod -a -G lingxi-shared lingxi
chown -R lingxi:lingxi-shared /home/lingxi /workspace /documents /downloads
chmod 2775 /workspace /documents /downloads /home/lingxi/shared
chmod 711 /home/lingxi /home/lingxi/agent-private

# Screen :10 is the browser-service display. Further agent screens are created
# lazily by AgentScreenManager (:11, :12, ...), each with its own input/VNC
# process but the same persistent filesystem.
runuser -u lingxi -- Xvfb :10 -screen 0 1440x900x24 -nolisten tcp &
runuser -u lingxi -- env DISPLAY=:10 openbox-session &

# The root broker owns Chromium's remote-debugging pipe and exposes only a
# mode-0600 Unix socket. Agent shell users have no TCP or filesystem path to
# CDP, while the service can still address an exact target/session.
/usr/local/bin/browser-broker &

# Do not report a usable Computer until its singleton browser service is
# reachable. A failed Xvfb/Chromium launch must fail the container rather than
# leaving `sleep infinity` running with no automation capability.
for attempt in $(seq 1 30); do
  if curl --fail --silent --unix-socket /run/lingxi/browser.sock \
      -X POST -H 'content-type: application/json' -d '{}' http://localhost/health >/dev/null; then
    exec sleep infinity
  fi
  sleep 1
done

echo 'Chromium broker did not become ready' >&2
test ! -f /tmp/chromium-broker.log || cat /tmp/chromium-broker.log >&2
exit 1
