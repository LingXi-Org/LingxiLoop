# #244 bounded visualization loading

Scope: after an existing complete reference mounts, obtain its authorized HTML,
fixed runtime resources, fresh state, then initialize the official SDK and show
interactive content. Generation/save/final-reference delivery is separate;
#243 retains its failed numerical cases. No paid provider calls in this task.

Failure inventory (before implementation):

- Two network waves for kit dependencies delay every cold card.
- Create/resource/state requests can stall before the existing handshake timer.
- Failure cleanup can itself wait forever on DELETE, blocking retry/capacity.
- An expired attempt can initialize late, mount after disposal or overwrite a retry.
- Parallel resources can change script order, duplicate requests, skip calendar/D3,
  or accidentally introduce shared privileged caches.
- Moving the state read earlier can overwrite a newer revision.
- Retained return, multi-card isolation, text/input responsiveness and SDK controls
  can regress. Placeholder visibility is not content visibility.
- Abort after a server-side create may leave an unknown capability until server
  expiry; do not claim browser cancellation rolls back server work.

Measure actual content paint, SDK-ready cards, clicked guest controls and Resource
Timing. Reuse the official tester-army/e2e + @e2e-dev/web fixture (explicit local API
transport, not a provider test). Same complete HTML, 1440x960 Chromium, same 250ms
per-resource injected delay, no-store. Short paired samples, one/three cards,
cold/switch/retained return. No production percentile or user-device claim.

The user's later instruction requests minimal necessary regression rather than
the skill's ten-pair/long acceptance gate. Preserve raw red results, screenshots
and measurements. Sole integrator publishes; this branch only supplies a draft PR.
