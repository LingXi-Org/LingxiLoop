# Resource preparation failures (before implementation)

Base: main `63948c598b9778a35941f3dcabf8ef57e2e2d6d8`.

The displayed preparation stage includes page acquisition and every authorized
resource fetch/body read. It precedes fresh-state reading and iframe/SDK mounting.
PR266 overlaps vendor reads with runtime; it does not recover a stalled or broken
resource request. A single stuck GET consumes the whole 15s budget and cancels
otherwise completed work. The error does not identify page acquisition vs resource.

Proposed narrow recovery: one retry of a safe resource GET after a connection/body
failure, transient HTTP 408/502/503/504, or 5s with no headers/body progress. Keep
the outer 15s preparation→SDK deadline and cancellation signal. Reset the idle
timer on each body chunk so a slow but progressing transfer is not restarted.
If the first GET is idle, leave it alive while the single recovery GET runs;
whichever provides a complete successful body wins and cancels the other. This
avoids turning a legitimate late first-byte response into a new failure. Total
concurrency is bounded at two requests per requested resource, never a loop.
Do not retry permission/not-found/rate-limit failures or acquisition POSTs. Preserve
the server authorization/integrity checks and no-store policy; no shared cache.

Failure inventory:
- Restarting a progressively slow valid response, or allowing an endless trickle
  to outlive the outer deadline.
- Retrying after parent cancellation, reusing a failed promise or partial body,
  mounting partial scripts, unhandled rejections, or leaking timers/readers.
- Refetching successful siblings, unbounded retries/concurrency, or retrying 403.
- Retrying 503 despite a Retry-After that does not fit the short recovery policy.
- Losing the fresh attempt capability on user retry or allowing stale work to mount.
- Reporting a timeout as SDK/iframe work before those stages have started.

Finite browser checks use actual pinned CSS/kit/runtime/vendor bytes, complete
synthetic HTML, real product host and official SDK, with test-only HTTP faults:
one stalled runtime request (red/green); interrupted body; 503 once; an 8s body
with regular progress; persistent disconnection followed by explicit retry;
403 without automatic retry. Record network attempts, phase/error and timings;
also check a 6s first-byte response still wins instead of being discarded at 5s;
assert actual guest content and interaction. Existing global-timeout/cancel/retry
coverage checks long stalls, not merely error-text changes. No provider calls or
private production content reads. These prove only the corresponding synthetic
paths; original-user network/server timing remains unknown.
