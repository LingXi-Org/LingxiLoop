# Conversation loading, personal list removal and visualization integration

This candidate combines PR251 (`9df5e9fbd3e2c58be4d3217404e13c611b1087de`), PR253 (`95985d7bbb8e2ff0c2d3a6bc1545cc6882e58f28`), PR250 (`39878f35de1f84952d8f5c91cffe77dc0763ad55`), PR252 (`62b6a19a4decbfe815ea5678a606baa086c0a6ac`), PR254 (`1002f0f1545ab596d85851735311ea74089b946e`) and PR255 (`52ee0d12130f0f4c2b36ec8191275d46d30c0907`).

PR252 was initially incorporated selectively, preserving the then-current page lifecycle. Its #244 ancestors were subsequently integrated through the separately reviewed final PR250, followed by PR254. The only fixture conflict combines PR250's reviewed page-creation implementation with PR252's `corners` fixture route. The final layout files match PR252, the bounded lifecycle files match PR250, and initial visibility scheduling matches PR254. Independent reviews found no remaining P1/P2 in these exact changes.

Existing evidence is retained without rewriting test logs:

- [#248](../issue-248/README.md): Web 73/73, final affected checks 5/5, lint/typecheck/build. Initial server integration was 43/47; only the five affected cases were rerun after correcting old assertions. The local 278→28 ms fixture is not a production latency measurement.
- [#247 numeric slice](../issue247-numeric/README.md): renderer 8/8, registry 1/1, dedicated local PostgreSQL public-tool integration 2/2, server lint/typecheck, independent review. This optional deterministic tool does not close #247 or turn historical provider quality failures green.
- [#246](../issue-246-layout/README.md): retained two-width inset red/green evidence and the 1440px CSS zoom 1.25 red/green case. No claim of native browser zoom, all devices, clipboard or complete dialog overflow coverage.
- [#244 bounded initialization](../../../perf/issue-244/REPORT.md): one 15-second initialization budget, cancellation, separate attempt identities and bounded background cleanup. Late POST red/green evidence covers the final correction; older four-fault and performance results were not all rerun on that final head. Unknown POST capabilities can still consume the existing quota until expiry.
- [#244 visible-history startup](../../../perf/issue-244/STARTUP-REPORT.md): one local before/after pair with one visible and five offscreen cards measured 4.81→1.27 seconds and 48→8 resource requests; scroll wakeup, resize, retained state, three visible cards and timeout retry have retained short evidence. These are not production percentiles.
- [Product49 release support](../../host-release.md): retained 60/60 release-contract checks and independent final review. Exact migration inventory and known/unknown failure boundaries remain enforced.

After the fixture conflict resolution, `node node_modules/typescript/bin/tsc -p e2e/tsconfig.json` passed on Node 22.23.3 with the existing formal runtime 3.5.8 dependency tree. An initial local invocation used an old 3.5.6 dependency symlink and failed on missing runtime exports; only this worktree's symlink was corrected, without installing packages or modifying shared dependencies. No additional browser or provider run was performed.

Production must explicitly apply product migration 0049 before serving the new conversation list query. It creates a personal, reversible list-removal table; shared messages and membership survive. Runtime 3.5.8 / native schema 13 remain unchanged. The product-only migration release must retain full checksum inventory, image provenance, Worker drain and native terminal/health checks. After migration, recovery is forward to a compatible product49 image, not restart of a product48 image.

This source integration record is not a deployment receipt. Exact CI, image identity and actual production acceptance are recorded separately by the sole integrator.
