# #247 bounded numeric chart slice

Base: `0767185956086a760c322ed4ac4eaf59eff0cb0c`. This is a partial fix for [#247](https://github.com/LingXi-Org/LingxiLoop/issues/247), not issue closure or a new model-quality acceptance.

`visualize.chart` is an optional public native transaction action. It accepts typed linear coefficients or ordered numeric observations, with optional differences between named base series. A small static renderer computes intersections, preferences, series changes and positive-increase maxima; SVG marks, visible labels, accessible tables and returned calculations consume those same numbers. Ordinary `visualize.save`, read/reference/export, text and code remain available. The existing actor/conversation/run binding, fragment validation, persistence and verification paths remain in force. No private runtime protocol or model-generated expression is evaluated.

Input limits are explicit: 2–6 linear series / 1–6 trend base series; up to 12 samples, 60 periods and 4 differences; 200-character trimmed unique labels; finite inputs within ±1e12 and computed magnitudes ≤1e15. Differences reference base series only. Each chart declares common units; there is no implicit unit conversion or inference. Ordered periods use input order. Percent changes are unavailable when the prior value is nonpositive. Calculations use JavaScript floating point; display rounds to at most 0–6 decimal places, while decisions use unrounded computed values. This does not promise arbitrary-precision mathematics, verify supplied data, or guarantee model interpretations/final prose. Untrusted text is escaped in HTML/SVG, with no scripts, external resources, links or expression evaluation.

## Evidence

The [failure model](FAILURE-MODEL.md) and initial tests preceded implementation. A separate review reproduced a cancellation-sensitive intersection rejection; the added test failed before the residual guard was corrected to account for operand scale. Independent final source review found no remaining P1/P2 after that correction, registry expectation update and dedicated-test database guard correction.

| Actual check | Result | Retained log |
| --- | --- | --- |
| Initial renderer admission | Failed before implementation (missing module) | `red.log` |
| Independent intersection counterexample | 7 pass / 1 fail before fix | `intersection-test-red.log` |
| Pure numeric renderer | 8 pass, 0 skip | `renderer-green.log` |
| Public product registry | 1 pass, 0 skip | `registry.log` |
| Actual public tool + PostgreSQL authorization/persistence/no-write paths | 2 pass, 0 skip | `integration.log` |
| Full server lint | pass, 593 files | `lint.log` |
| Full server typecheck | pass | `typecheck.log` |

Executed on Node 22.23.3 with existing dependencies. The two integration checks used a newly created isolated local database `lingxiloop_issue247_numeric_test` (product schema48, published runtime3.5.8), existing local PostgreSQL and Redis DB15. No old database was reset, no production credentials were copied, and no provider/browser was called. Integration teardown completed naturally; registry used the existing repository unit-runner `--test-force-exit` convention and does not establish lifecycle behavior. No installation, migration source, manifests, locks, client code or visual E2E was changed. `SHA256SUMS` covers these retained logs.

Reproduce the pure check with `node --import tsx --test server/src/__tests__/visualize-numeric.test.ts`. Run `npm run server:lint` and `npm run server:typecheck`. The existing integration runner discovers `server/src/__integration__/visualize-numeric.test.ts`; select it with `npm run test:integration -- --file visualize-numeric.test.ts` and an already migrated dedicated test DB, never production. The registry assertion remains in the normal server test set; CI also discovers changed numeric unit tests.

## Remaining delivery gap and upstream boundary

The original paid quality failures remain unchanged in [the retained acceptance](../issue-217-quality/ACCEPTANCE.md) and [PR243 release record](../visualize-contract-release-20261020/README.md). These deterministic checks do not turn the original 25 provider calls or incomplete output cases green. This slice supplies a safe calculation-and-render path when selected; it cannot enforce reliable skill activation or complete delivery and must not close #247 on its own.

The installed public `SkillDefinition` exposes `name`, `description`, `version`, `body` and `actions`; public `RunVerificationContext` exposes `candidate`, `work`, `requestVersion`, `database`, `signal`, `deadlineAt`. Neither is an authoritative authoring-activation/delivery-obligation state. A minimal upstream design should add an explicit authoring activation separate from reference-only skill reads, and expose bounded typed obligations through candidate verification, bound to tenant/run/request version and skill version/hash. Artifact delivery or an honest unsupported/failure outcome can resolve an obligation, without treating save/hash success as numerical quality. Reading examples or exporting must not activate an unwanted chart requirement. Likely upstream ownership boundaries are public `src/skills/definition.ts`, `src/app/index.ts`, their public exports and native activation/verification persistence tests. This proposal is not implemented here; it needs an upstream contract owner and published compatible runtime before product integration. No runtime release or lock edit is included.
