#!/usr/bin/env bash
set -euo pipefail

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
# process against this user-data-dir.
runuser -u lingxi -- env DISPLAY=:10 chromium \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/lingxi/.config/chromium \
  about:blank &

exec sleep infinity
