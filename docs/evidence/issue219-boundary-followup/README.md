# #219 repair-chain follow-up

Exact base: `f80924de67dd8bd8734c1af62b1f442bae2ce8a6`, read from remote `fix/issue219-content-boundaries`. Independent branch `codex/issue219-boundary-regression`. No product implementation, dependency/lock, Docker, permission or production change is introduced by this follow-up. The parent repair retains separate legacy criteria paragraphs and owner-only answer recovery.

## Native browser investigation

The parent's retained final run was 6/7, failing bold styles after immediate shortcuts; its earlier run failed mobile formatting selection instead. The unchanged repair first passed all seven cases here (`baseline/`, run `01a157c9-0d92-7c4e-81f5-5cb870512630`). This does not establish a deterministic product bug.

Both the parent log and this first fixture log show dependency optimization causing a page reload; optimized code under `.codex-tmp` also passed through Babel's source transform. This is a confirmed harness setup/synchronization defect and a plausible contributor to the intermittent keyboard failures, not proof of a unique causal explanation for every historic failure. The follow-up reuses the product's full optimize-dependency configuration, scans real entry points instead of the fixture-only injected export, and caches built dependencies under `node_modules`. No editor implementation or native control is replaced. The corrected cold/restarted logs are retained so late optimizer reloads and source recompilation can be checked.

The existing native assertions are retained. The bold-shortcut case additionally waits for initial content, explicitly focuses the editor, checks the paragraph conversion, and checks visible bold text before saving; the mobile case checks the actual selected text before expecting the native toolbar. These are observable UI states, not injected editor state, arbitrary sleeps, retries or skipped assertions. The new selection callback initially returned optional `undefined`; the E2E typechecker caught it and it now returns JSON `null` when absent. The initial type failure is retained separately.

## Real content boundaries

The existing three owning HTTP/PostgreSQL suites pass **59/59**, including the repair's new test for private A→current B report input, real submission INSERT, idempotency, historical-row read projection, tenant/peer isolation and preservation of owner recovery. `checks/owning-integration.log` is the actual run, not the supplementary probe. The actual-source probe also passes **6/6** (`payload/`), with its original limitations retained.

The #219 forum browser now starts with two legacy criteria, including literal Markdown and an internal newline. It appends text, saves through actual HTTP, reopens, changes only native formatting, saves again, and asserts two criteria/two native blocks with stable IDs and the unchanged second block. It then edits a real legacy answer A into native B, saves/reopens the owner draft, captures the loopback model's actual request, submits the immutable answer/report, and reads the teacher submission through HTTP. The exact shared native document must match B with only recovery metadata omitted. Existing publication, upload failure/retry, private legacy feedback/media, return decision and student reread assertions remain. No live provider quality claim is made.

## Real migration check

`verify-migration.mjs` creates a new loopback-only dedicated test database and refuses to adopt or drop an existing one. It runs the real migration function through 0047, inserts old forum/homework rows, then applies 0048. It checks all eleven nullable JSONB columns, unchanged pre-existing values/timestamps, stored SHA256 ledger values, a second runner no-op, readiness, and direct SQL idempotence. [Receipt](migration/receipt.json) and [old rows](migration/old-rows.json) are actual PostgreSQL results.

0047 is borrowed byte-for-byte from #216 remote `cef2349c71f576ca53e76a1b12eacfdec5f75eba`, SHA256 `3d0c372c6fee6c61b3cea64d02cdfd463468b68fb097efe2cbc47d0e8fe263a5`, and is not committed here. The repair uses the exact published runtime3.5.6/schema12. This validates real product **47→48** and HTTP behavior on that repair; **it does not validate #216's separate schema13 migration-runner/runtime combination or final release CI**. That integration remains with the sole integrator. No placeholder migration or sequence bypass was created.

## Reproduce

Use Node22.23.3, the unchanged exact lock and installed official `e2e`0.17.0 / `@e2e-dev/web`0.12.0. Browser and database tests use synthetic local identities, disposable PostgreSQL/Redis, recorded IM and in-memory objects.

```sh
node e2e/content-boundaries/serve.mjs
CONTENT_BOUNDARY_NATIVE_REGRESSION=1 CONTENT_BOUNDARY_OUTPUT=artifacts/issue219-followup/reproduce E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config e2e.content-boundaries.config.ts
node e2e/server/content-editor.mjs --integration-only
node e2e/server/forum.mjs --browser-only --issue219
BOUNDARY_PROBE_OUTPUT=artifacts/issue219-followup/probe node --import tsx docs/evidence/issue219-content-boundaries/boundary-probe.mjs
# Set INTEGRATION_DATABASE_URL to a new loopback-only lingxiloop_219_migration_<digits>_test DB; the script creates it.
ISSUE219_MIGRATION_OUTPUT=artifacts/issue219-followup/migration node --import tsx docs/evidence/issue219-boundary-followup/verify-migration.mjs
npm run test:e2e:typecheck
npm run typecheck
npm run server:typecheck
```

Parent historic red artifacts remain untouched. Reports preserve original runner paths; committed screenshots are alongside the reports using their original leaf names. Large traces stay in ignored artifacts and are not copied with synthetic authentication requests. Final run IDs and source hashes are in `receipt.json`.

## Final run inventory

| Run | Result | Exact run ID |
|---|---|---|
| Unchanged repair baseline | 7/7 | `01a157c9-0d92-7c4e-81f5-5cb870512630` |
| Corrected cold fixture | 7/7 | `01a157cd-0699-793b-8cd9-4b1c4ab4cf5e` |
| Corrected fixture after process restart | 7/7 | `01a157ce-d5bf-71a8-86c2-4bea41e6c99b` |
| Actual HTTP forum/private feedback/criteria/answer/report/teacher boundary | 3/3 | `01a157ce-22a2-7680-ac8a-02a78c7eb58d` |

All recorded browser runs have zero skips and zero retries. Web/node, server and E2E typechecks and affected-file lint pass. The native fixture process is stopped; installed browser caches and parent historical evidence remain. No new product build is claimed: product implementation/dependencies are byte-identical to f809, whose prior build is in the parent evidence. The remaining release gate is the sole integrator's final #216 runtime/schema13 combination and exact combined CI; this draft does not merge or deploy it.
