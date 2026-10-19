# Issue 193 browser acceptance coverage

All browser interaction uses `e2e@0.17.0` and official `@e2e-dev/web@0.12.0`. No direct Playwright interaction/import is used. Fixture tests exercise actual product host, bridge, guest runtime and components with deterministic API persistence; they do not prove backend tenant authorization or actual-model generation.

| Required behavior | Result | Evidence |
| --- | --- | --- |
| Independent original/product screenshots | PASS: six exact RGBA pairs, zero differing pixels; 4/4 scenarios | `web-final/report.json`, `web-final/diff/diff-report.json` |
| Original Web theme, native control color scheme, font, viewport/DPR | PASS: Zai light/dark, Inter, 1440×960/DPR1; computed metadata and source hashes recorded | `web-final/*-interaction.json`, `web-final/manifest.json` |
| Card automatic height, toolbar keyboard visibility | PASS in both full product themes and original baseline | `product-pre-theme-correction/report.json`, `recheck-initial/report.json` |
| Tweak groups, range, color, toggle, select | PASS, exact guest output verified after edits | `product-pre-theme-correction/*-interaction.json` |
| Original preview, reset, submit | PASS; expected original/edited outputs and follow-up text/value asserted | same |
| Expanded dialog, collapse, preserved guest state | PASS; same saved count through expand/collapse/reload | same; final dialog screenshots in `web-final` |
| Variants, tabs, D3, calendar selection | PASS | `recheck-initial/report.json` |
| Mobile width bounded at 390×844 | PASS | `recheck-initial/report.json` and mobile screenshot |
| Session A/B state isolation and theme update | PASS with deterministic API persistence | `recheck-initial/report.json` |
| Failed acquisition / explicit retry | PASS | `recheck-initial/report.json` |
| Offline UI and reconnect | PASS | `lifecycle-first-correction/report.json` |
| Synthetic clicks, claimed gesture, unsupported tools/files | PASS: no action side effect; real follow-up and real local external link positive controls | `recheck-initial/report.json`, `recheck-initial/bridge/gestures.json` |
| Revoked page, retry, replaced-page requests, scope close | PASS: actual author document unloaded, page closed, retry succeeds; replaced guest operations reject; scope close releases all pages | `functional-final/report.json`, `functional-final/bridge/lifecycle.json` |
| Capacity reaches 64 before 65th admission and restores old state | NOT VERIFIED: page index 41 failed its ready deadline after indices 0..40 passed; trace shows HTTP 200 then loading/error. No 64/65 boundary was reached; exact error cause unknown | `functional-final/capacity-diagnostic.json`, `functional-final/capacity-trace.zip` |
| Copy-image native write and actual PNG supplied to browser | NOT PASSED: observer captured one native call and original rejected promise, `Write permission denied`; no successful PNG evidence | `functional-final/clipboard-write-interaction.json` |
| OS clipboard readback | NOT VERIFIED: native read permission denied; sandbox-on permission-provider startup blocked by `No usable sandbox`, stopped without weakening sandbox | `recheck-initial/report.json`, `clipboard-environment-blocked/chromium-stderr.log` |
| Independent original render.py export, offline resources/state reload | PASS for fixed authored export fixture | `export/report.json`, `export/export.html` |
| Actual model question → generated reference → widget → tweak → continuation | NOT PASSED: runtime-owned real provider attempts failed before producing HTML | runtime-owned attempt reports; no live browser artifact |
| Actual-model standalone exported HTML | NOT PASSED: no actual-model HTML delivered to export browser runner | prepared `run-live-export.mjs`; no successful report |
| Real tenant/project/session/path/resource authorization | Separate backend-owned integration evidence; not inferred from browser mock | backend-owned report coordinated by parent |
| Pinned source/skill/runtime inventory | Separate immutable audit, 223 source files and exact 24-file skill tree; browser manifest records consumed hashes | `third_party/zcode/manifest.json`, `third_party/zcode/VERIFICATION.md`, `web-final/manifest.json` |

The earlier `product-pre-theme-correction/diff` zero differences are superseded for presentation: its harness lacked original Web entry theme/font inheritance. The final `web-final` comparison corrects the shared input, keeps independent CSS sources, and preserves every earlier report. The native-write observer, if successful, proves fulfillment of the original browser write promise and records the supplied PNG; it must never be called OS readback.
