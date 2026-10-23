# #356 — delivered visualization references

Base: `be301f2b25a7969af92674ada6f542ff0b90eec2`, published LingxiOS 3.8.5. Verification date: 2026-10-23 UTC.

## Confirmed defect and change

Completed SSE/recovery snapshots had the stable `run-*` UI identity but omitted the delivery alias present in the canonical IM payload. The preview client fell back to that UI identity; strict page admission correctly rejects it. A new request/result/fence also inherited the previous result's IM aliases during snapshot merge.

The projection now resolves only an accepted, payload-verified product IM receipt for the authorized run and exact result/request/fence. Pending, ambiguous or mismatched receipts do not supply an alias. The client waits for an actual reference, retains readable prose, and clears previous-generation aliases. Same-result replay retains its valid reference. Page admission and source-keyed page ownership remain unchanged.

This is a code-level race reproduced with synthetic inputs. The reported historical production 403 has no captured browser request identifying its original trigger; this document does not claim that private example was reproduced or repaired in production. No production request, data change or deployment was performed by this verification.

## Verification

The [failure model](./FAILURE-MODEL.md) and regression assertions were written before the implementation. Initial tests failed because recovery omitted the accepted alias and a new result retained the old alias.

| Check | Result |
| --- | --- |
| `run-updates.test.ts`, `store.test.ts`, `assistant-transport.test.ts` | 30 passed, 0 failed |
| `visualize-generation.test.ts`, `visualize.test.ts` | 7 passed, 0 failed; real isolated PostgreSQL, formal runtime Worker, recording IM boundary |
| Official `@e2e-dev/web` / `e2e` 0.17.0, `answer-first/visualize.e2e.ts` | 3 passed, 0 failed; Chromium desktop 1280 × 900 |
| Server and web TypeScript | Passed |
| Focused Biome and diff whitespace | Passed |

The integration test verifies a recovered alias admits the actual delivered visualization, rejects altered echo channel/sender/alias/sequence and pending acceptance, then recovers the restored accepted receipt. Existing membership revocation, overwritten-document, state and lost-ack checks pass. All database fixtures were in a new loopback test database; no production configuration or provider inference was used.

The browser test verifies completed prose remains visible while there is no alias, with zero preview POSTs; the verified alias enables exactly one page acquisition. Same-result replay does not reacquire it. The two existing owner-rebinding and late old-owner response tests also pass. Initial browser setup/API errors were corrected before the successful run; no application assertion was weakened.

Browser run: `01a1691c-0933-7b42-9b93-38d0212054ba`. Its local report is `.e2e/issue356/browser/report.json`, with screenshots `verified-delivery-reference-before-preview`, `answer-first-visualize-owner-rebound`, and `answer-first-late-owner-response-isolated`. Generated logs/screenshots stay outside the public source tree. The fixture server was stopped after verification.

Reproduce with the existing test-environment variables and formal dependencies: run the three focused files using Node with `--import tsx --experimental-test-module-mocks --test --test-force-exit`; run the two integration files using the repository integration runner against an isolated migrated database; run `e2e/answer-first/visualize.e2e.ts` using the official `e2e.answer-first.config.ts` browser configuration. No schema change is required.

Independent final review, exact-head CI and production rollout are separate gates owned by the release integrator; this evidence does not predeclare them successful.
