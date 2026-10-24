# #376 review candidate — blocked from release

This branch combines storage `325e9877` + `80a75326`, generation `d54783c5` +
`1b899a8c`, and the five UI commits `bef861d6` through `b0618d06`. It is a review
candidate, not completed feature acceptance. CasesPage/#375 integration is absent.

- **Browser network isolation failed.** The synthetic WebRTC probe received
  **4 loopback UDP packets** despite opaque frames/CSP. The HTTP counter was zero;
  that does not prove no-network isolation. Browser runs were **3/9 passed** and
  **1/7 passed**. Native pointer interaction and five navigation probes remain
  unverified. Preserve these failures; do not weaken sandbox, touch, or lifecycle
  guards to make tests pass. See [UI evidence](src/features/cases/cover/EVIDENCE.md).
- **Server capture is unproved.** Local bubblewrap failed during UID-map setup
  (`Read-only file system`); the target did not execute. There is no production
  Chromium first-frame capture proof. Package/image build and resource-limit
  compatibility are also unverified. See [renderer evidence](server/src/modules/case-covers/README.md).
- **Production diagnostics are unresolved.** Root reports capability probe A's
  stream timed out, so its outcome is unknown; probe B was not executed. Root is
  closed only its own diagnostic terminal and confirmed it absent. This cleanup
  does not establish the probe outcome or authorize a retry. This integration
  performs no production operation.

Minimum remaining work: choose and verify an execution design that enforces
no-network isolation for model code; prove the approved server capture path;
then root integrates CaseCover and bounded polling into list/detail/saved editor
preview alongside #375. Obtain three content-grounded article/model generations
and passing official browser interaction/accessibility/isolation acceptance on
the final candidate before release CI and rollout. Existing storage/database
checks do not substitute for those gates.

This integration only runs type/lint checks. It does not rerun database, browser,
model, installer, upstream qualification, package build, or production probes.
The sole integrator may publish this draft for review; merging and deployment
remain blocked by the explicit acceptance gaps above.
