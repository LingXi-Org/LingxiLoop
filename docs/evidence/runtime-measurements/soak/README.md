# Original 3.5.1 soak: incomplete at the 24-hour review

The October18 review recovered **797 original samples /47829.580654557 seconds
(13h17m09.6s)**, ending **2026-10-17T19:59:57.427Z**. The previous remote
checkpoint contained782 samples through19:44:56UTC. Its heartbeat bytes are an
exact prefix of the recovered file;15 original samples have now been preserved.

**The24-hour observation is incomplete and cannot be accepted.** There is no
`terminal-receipt.json`; monitorPID285092 and watcherPID363050 are absent, and
both `/tmp/acceptance-soak*.log` files are missing. The cloud executor is currently
readable, but the original observation processes are no longer alive.

The797 preserved records have no recorded violations and no heartbeat gap above
90seconds (maximum60.277seconds). This only describes that recorded interval.
There is no evidence covering the remaining38570.419seconds required to reach
86400seconds. The stopped container reports a later finish at
2026-10-18T03:06:44.342155652Z; that is not monitored coverage and does not extend
the last verified heartbeat. The reason observation ceased cannot be determined
from the remaining files.

`state.json` and `heartbeats.jsonl` are copied byte-for-byte from the original
source. In particular, the historical `status: running` field is deliberately
unchanged: it is a stale saved value, not a live status assertion. The older
`handoff.json` also remains an original checkpoint. The separate
[recovery inspection](recovery-inspection.json) records current facts and file
SHA256s; it is **not** a generated terminal receipt or passing result.

No monitor/container was restarted, no timer reset, no production operation or
credential retrieval performed, and no issue closed. This remains the original
**3.5.1 Web/API-only** scope, never3.5.2 endurance, complete Worker or live-provider
qualification.
