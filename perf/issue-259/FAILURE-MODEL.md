# First visible card dependency barrier

Baseline: main `c66e847d14f838e72d0ab19e252e6cd4e2b68a76`.

Hypothesis: the document builder waits for CSS, kit, runtime and calendar before
starting vendors declared by the kit/fragment. A slow runtime response therefore
adds an unnecessary vendor round trip to the first visible card. Fetching those
same declared resources once the kit is available should overlap that wait.

Failure inventory before implementation:

- Early fetching changes script execution order (Floating UI Core before DOM,
  author D3 before its use), requests an undeclared vendor, or fetches twice.
- A kit/vendor rejection escapes the owning promise, leaves an unhandled rejection,
  mounts partial HTML, or leaves work running after cancellation/timeout.
- Resource failure/retry changes capability isolation or late state projection.
- A loading placeholder or SDK ready alone is mistaken for real usable content.
- Browser warm cache, retained frames, several offscreen cards, or runner capture
  costs make the claimed single-card improvement misleading.

Finite verification plan: one baseline/candidate cold single-card trace with
1200ms runtime, 500ms vendors, 40ms other resources, no-store and the real card,
opaque frames and official SDK. Assert vendor fetches overlap runtime, exactly
one page and eight resource reads, visible sized content, then interact with
the actual guest. Record stage times before asserting (so baseline evidence is
retained). Repeat a candidate with the kit as the slow dependency to check the
dependency barrier still exists where needed. Run the existing bounded-resource
timeout/cancel/retry regression, plus owning web checks and final review.

Local transport is deterministic and does not measure production DB, manifest
disk reads, delivery time or network. No provider calls or production writes.
