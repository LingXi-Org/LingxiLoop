#!/bin/sh
# cumora-agent-computer entrypoint.
#
# Brings up the agent's runtime in dependency order, then execs the
# long-running agent loop:
#
#   1. Xvfb on :99           — virtual X display for Chromium
#   2. Chromium               — loaded with the OpenCLI browser-bridge
#                               extension; --user-data-dir on the PVC so
#                               cookies / login state survive pod restarts
#   3. opencli daemon         — local bridge (port 19825) the agent uses
#                               via `opencli browser ...` to drive Chromium
#   4. cumora-fuse on /workspace — agent's per-agent slice of the DB-FS
#   5. node /app/agent-computer.cjs — the agent loop
#
# All side processes are backgrounded; the agent loop holds the wait
# slot so PID 1 (tini) sees a single "real" foreground child. On SIGTERM
# we forward to every side process and give them time to exit cleanly
# before SIGKILL takes over.
set -eu

: "${CUMORA_AGENT_RUNTIME_URL:?CUMORA_AGENT_RUNTIME_URL not set — orchestrator should inject it}"
: "${CUMORA_AGENT_RUNTIME_TOKEN:?CUMORA_AGENT_RUNTIME_TOKEN not set — orchestrator should inject it}"

CHROME_PROFILE_DIR="${CHROME_PROFILE_DIR:-/opt/chrome-profile}"
OPENCLI_EXTENSION_DIR="${OPENCLI_EXTENSION_DIR:-/opt/opencli-extension}"
CHROMIUM_BIN="${CHROMIUM_BIN:-/usr/bin/chromium}"
DISPLAY="${DISPLAY:-:99}"
export DISPLAY

mkdir -p /workspace "$CHROME_PROFILE_DIR"

# Stale Chromium singleton locks. Chromium's profile lock symlinks
# (SingletonLock / SingletonCookie / SingletonSocket) are written
# directly into --user-data-dir and reference the original
# container's hostname + pid. When the previous pod was killed
# without a clean shutdown (kubelet SIGKILL, OOM, node reboot, etc.)
# these symlinks survive on the PVC and the next pod's Chromium
# refuses to attach to the profile ("appears to be in use by
# another Chromium process … on another computer"). Sweeping them
# at startup is safe: by the time we get here, no Chromium is
# running in THIS pod, and the file lock would have been our own
# previous pod's anyway.
rm -f "$CHROME_PROFILE_DIR/SingletonLock" \
      "$CHROME_PROFILE_DIR/SingletonCookie" \
      "$CHROME_PROFILE_DIR/SingletonSocket" 2>/dev/null || true

# ─── 1. Xvfb ──────────────────────────────────────────────────────────
# 1280x800x24 — enough headroom for any normal site layout. -ac disables
# host access checks (we're the only X client). RANDR + GLX shut up
# Chromium's "where's my display" warnings. Logs go to /tmp so they
# don't drown stdout.
Xvfb "$DISPLAY" -screen 0 1280x800x24 -ac +extension RANDR +extension GLX -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Wait for the X display to be live before launching anything that
# expects it. Without this race, Chromium's startup occasionally races
# Xvfb and bails with "cannot open display". Cap at 5s — Xvfb usually
# comes up in <500ms and a longer wait just delays the agent loop.
i=0
while [ $i -lt 50 ]; do
  if [ -e "/tmp/.X${DISPLAY#:}-lock" ]; then break; fi
  sleep 0.1
  i=$((i + 1))
done

# ─── 2. Chromium ──────────────────────────────────────────────────────
# Flags rationale:
#   --no-sandbox + --disable-setuid-sandbox — Chromium's sandbox requires
#     either a setuid helper or user namespaces, neither of which we can
#     reliably get inside a K8s pod (even with CAP_SYS_ADMIN). The pod
#     itself is the security boundary.
#   --disable-dev-shm-usage — /dev/shm is tiny in containers by default
#     and Chromium loves OOMing on it. Forces tmpfs-on-disk fallback.
#   --no-first-run / --no-default-browser-check / --disable-default-apps
#     — skip every interactive welcome screen.
#   --remote-debugging-port=9222 — OpenCLI's daemon talks CDP to this
#     port. Bound to localhost only (default for Chromium).
#   --user-data-dir on the PVC mount — cookies, history, login state,
#     extension storage all survive pod restarts.
#   --load-extension — points at the unpacked OpenCLI extension baked
#     into the image. The extension persists its state inside
#     --user-data-dir, so settings survive too.
"$CHROMIUM_BIN" \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --no-first-run \
  --no-default-browser-check \
  --disable-default-apps \
  --disable-features=Translate,MediaRouter \
  --remote-debugging-port=9222 \
  --user-data-dir="$CHROME_PROFILE_DIR" \
  --load-extension="$OPENCLI_EXTENSION_DIR" \
  --window-size=1280,800 \
  about:blank \
  >/tmp/chromium.log 2>&1 &
CHROME_PID=$!

# ─── 3. OpenCLI daemon ────────────────────────────────────────────────
# Daemon auto-starts on first CLI invocation, but priming it eagerly
# means the first `opencli browser ...` call doesn't pay the spin-up
# cost. Failure to start here is non-fatal — the CLI will try again
# on demand.
(opencli doctor >/tmp/opencli-doctor.log 2>&1 || true) &

# ─── 4. cumora-fuse ───────────────────────────────────────────────────
/usr/local/bin/cumora-fuse \
  "$CUMORA_AGENT_RUNTIME_URL" \
  "$CUMORA_AGENT_RUNTIME_TOKEN" \
  /workspace &
FUSE_PID=$!

# Shutdown forwarder. Kills every side process in reverse-bringup
# order with a 6s grace per group, then SIGKILL fallback. The agent
# loop itself shuts down via its own signal handling; we get here on
# pod terminate OR after the agent loop exits.
shutdown() {
  echo "[entrypoint] shutdown: fuse=$FUSE_PID chrome=$CHROME_PID xvfb=$XVFB_PID"
  for pid in "$FUSE_PID" "$CHROME_PID" "$XVFB_PID"; do
    [ -n "$pid" ] || continue
    kill -TERM "$pid" 2>/dev/null || true
  done
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    alive=0
    for pid in "$FUSE_PID" "$CHROME_PID" "$XVFB_PID"; do
      [ -n "$pid" ] || continue
      if kill -0 "$pid" 2>/dev/null; then alive=1; break; fi
    done
    [ "$alive" -eq 0 ] && return
    sleep 0.5
  done
  echo "[entrypoint] side processes didn't exit in 6s, SIGKILL"
  for pid in "$FUSE_PID" "$CHROME_PID" "$XVFB_PID"; do
    [ -n "$pid" ] || continue
    kill -KILL "$pid" 2>/dev/null || true
  done
}
trap shutdown TERM INT

# Wait up to 10s for /workspace to become a mountpoint.
i=0
while [ $i -lt 100 ]; do
  if mountpoint -q /workspace 2>/dev/null; then break; fi
  sleep 0.1
  i=$((i + 1))
done

if ! mountpoint -q /workspace 2>/dev/null; then
  echo "[entrypoint] warning: /workspace did not become a FUSE mountpoint within 10s"
else
  echo "[entrypoint] /workspace mounted via cumora-fuse"
fi

# ─── 5. agent loop ────────────────────────────────────────────────────
# Background it so we can keep handling SIGTERM (forwarded above) when
# the pod terminates.
node /app/agent-computer.cjs &
LOOP_PID=$!
wait $LOOP_PID
LOOP_EXIT=$?

shutdown
exit $LOOP_EXIT
