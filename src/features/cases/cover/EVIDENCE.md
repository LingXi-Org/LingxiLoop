# #376 UI evidence — blocked, no release acceptance

Worktree `/tmp/loop-376-ui`, base `2686f475eac075bc9033f13714d5d6bbfa5078eb`.
Node22.23.3, official `e2e`0.17.0 + `@e2e-dev/web`0.12.0, existing
Chrome153 over CDP `http://127.0.0.1:9337`. No browser flags changed, no installs,
upstream installer/build/validate executions, production/private reads or deployment.

## Confirmed security failure

`.e2e/case-cover/webrtc-characterization.json`: inner opaque blob document
successfully offered an `RTCPeerConnection`; the loopback-only STUN counter
received **4 UDP packets**, while the HTTP probe counter remained0. The
characterization test records this exposure; its test success does **not** mean
security acceptance. The arbitrary generated-JavaScript **no-network requirement
fails**. `allow-scripts`, opaque origins and the two-level CSP wrapper are
insufficient. Do not publish this feature as secure or close #376.

The UDP probe bound exclusively to127.0.0.1:51890, used synthetic data only and
sent nothing externally. Both TCP5189 and UDP51890 were free before startup and
after each run. `.e2e/case-cover-app.log` retains the last start/stop receipt.
Chrome9337 stayed alive and the browser slot was handed directly to ux_state.

## Actual browser runs

1. `.e2e/case-cover-run/report.json`, run `01a16c6d-e8a9-78aa-a195-d0d8c376fd86`,
   05:41:45–05:43:06UTC: **3 passed /6 failed /9 selected**. Light lifecycle,
   keyboard activation, parent/storage/fetch denial, two-renderer cap and scope
   disposal passed. Direct location HTTP probe passed (counter0). WebRTC
   characterization observed UDP4. Dark theme failed because the fixture forced
   DOM theme without setting the theme context's default. Four nested-document
   probe fixtures embedded an unescaped closing script tag and could not establish
   their execution marker. Pinned upstream riffle rendered with400×320 viewBox,
   but its dark-theme assertion failed at the same fixture mismatch.
2. `.e2e/case-cover-corrected/report.json`, run `01a16c70-ade7-7f01-919e-ae0aee34ce08`,
   05:44:47–05:46:25UTC: affected subset **1 passed /6 failed /7 selected**.
   Dark lifecycle passed after the fixture context correction. Five navigation
   probes failed because their controller toggled engagement off and the host
   removed the frame, rather than preserving it for the probe. Pinned riffle's
   name,5:4 viewBox and dark-theme assertions passed; native hover failed because
   the preview image intercepted pointer events. No third run was made.

Relevant source details: `CaseCover.tsx` gives the iframe pointer events only
when `finePointer && ready`, where finePointer requires both hover:hover and
pointer:fine. A cover is active only while visible, foreground, motion permitted
and hovered or explicitly engaged. The probe controller assumed `.hover()` would
maintain that activation after toggling engagement off. Media-query values and
actual hover-state callbacks were not measured, so the exact cause is unresolved.
Do not report native pointer interaction or those five policy probes as passed.
The guards preserve touch scrolling; they were not weakened to make tests green.

Both browser reports accurately retain `vcs.dirty=true`: fixture/log changes were
in progress on top of0c599890 during these runs. The manifest hashes the final
fixture bytes and raw reports; the failed runs are not represented as clean-head
acceptance. Screenshots are synthetic; the upstream riffle screenshot is from a
failed scenario and is not a three-article generation acceptance sample.

## Owning checks and review

Focused CaseCover/helper node tests:10 passed. They cover initial inert rendering,
fallback/retry accessibility, exact message shape/source, escaped model closing
tags, asset URL normalization, two-renderer disposal, cancellation, finite retries,
and an active120s polling deadline including an abort-ignoring late result.
Scoped Biome passed. Full web typecheck passed after restoring the tiny tracked
streaming range utility omitted by sparse checkout. Focused e2e config/test
TypeScript passed. Whole e2e typecheck has unrelated existing recovery/alias
errors; no claim that it passed. No full build was run in this resource slot.

ux_state independently reviewed the runtime: the URL dot/encoded separator and
hung-read deadline P2 findings were fixed in d0549580 and7f48df51 and independently
rechecked with10 passing tests. No further P1/P2 was found in that reviewed scope.
Runtime fallback alt was subsequently made generic when the manual image is shown.

## Alternatives researched, not implemented

- Existing `visualize/web/document.ts` uses opaque frames and CSP, with a static
  resource CDN allowlist. It provides no stronger no-egress boundary.
- Canvas MCP app preview has a trusted nonce script and CSP; it adds no process or
  network isolation for arbitrary model code.
- Presentation rendering permits only its fixed hashed runtime and inert slide
  iframe (`sandbox=""`). This safer pattern cannot run arbitrary custom Hairline
  figure JavaScript unchanged.

A new design decision is needed: a bounded declarative figure/interaction format
interpreted by trusted code, or a provisioned execution environment with enforced
network/resource isolation and sanitized output transport. Neither is already
provided by these preview facilities. Static SVG is a safe image-context fallback,
but does not meet the interactive requirement. Root owns that decision, final
CasesPage integration with #375 and all release work.
