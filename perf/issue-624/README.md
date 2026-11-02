# #624 optional script failure recovery

Baseline: `820a2df0d995da84e8879c163a274f58e34b81c3`. The issue contains text
logs, no attached image or affected artwork. One consolidated question was posted
in the issue; the actual artwork/browser/frequency remain unconfirmed.

The shell's capturing error listener previously treated every external script
and stylesheet error as a fatal editor error. In a real Chromium 154 run using
the actual ArtifactEditorFrame, packaged Design renderer and existing isolated
grant gateway, injecting an optional beacon after 1 second caused an actual CSP
violation and then “设计编辑器资源未能加载，请重试。” The iframe was removed.
The still-running 30-second initialization deadline subsequently overwrote the
message with exactly the reported “设计编辑器尚未打开，请重试。” See baseline.json.
This proves a concrete matching failure mechanism; it does not establish all
conditions of the user's unprovided production artwork.

The build now marks only the entry module and blocking stylesheet as critical.
The existing error listener reports failures only for those elements. Optional
analytics still encounters the same CSP, but cannot remove the editor. An
existing error cancels the initialization deadline, preserving its actual reason.
No CSP, sandbox, origin, grant, credential, stored document or publish boundary
is changed. No analytics domain is added to the policy.

Validation uses the existing focused synthetic HTTP fixture, with an opt-in
PERF624_OPTIONAL_BEACON flag to inject the optional script in the real server
response. It does not intercept/fulfill the document response: Chromium 154
assigns fulfilled documents a different address space and then blocks loopback
subresources, which is a fixture limitation encountered during early attempts.
Those attempts are excluded from the reported reproduction. Local HTTPS uses
the existing generated test certificate/SPKI setup; no product TLS settings change.

Reproduce with the fixture build and HTTPS setup documented in ../issue-611.
Serve an unchanged baseline worktree and its frontend/generated editor first:

```sh
PERF624_OPTIONAL_BEACON=1 PERF_TLS=1 PERF_DESIGN_DIST=<baseline-editor-output> node --import tsx perf/issue-611/serve.ts <baseline-root> <baseline-web-output> 4194
PERF624_BASELINE=1 python3 perf/issue-624/repro.py
```

Then serve this candidate's generated editor and frontend with the same flag,
and run `python3 perf/issue-624/repro.py`. The fixed run checks CSP-blocked beacon
plus a network-blocked optional script after editing, real edit publication,
retained reopen, saved refresh, and exactly one iframe. It also blocks the real
critical entry, waits beyond the original 30-second deadline, verifies the
accurate resource error remains, and retries to a fresh grant with saved content.
Results and screenshots are in evidence. The source-level regression failed on
the old listener and passes with the marker check; asset tests require exactly
two marked critical elements while preserving executable/font bytes and SRI.

Production acceptance on the affected artwork remains with the release
integrator and reporter. This task performs no deployment or production write.
