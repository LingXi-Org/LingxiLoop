# PR236: align old scope fixtures with the published memory contract

Frozen base: `28f7dc5ad27ae3cbd8cf614dad9b055f29bdc412`. Installed dependency: exact published `@lyyzka/lingxios` **3.5.8**, reused read-only from the integrator's installed node_modules. Only the two owning integration tests and this evidence directory change. Product authorization, runtime, dependencies, migrations and provider configuration are unchanged.

## Why these expectations change

`server/src/modules/memory/public.ts:47–56` revalidates the current human, Agent, both channel/product memberships and conversation permission. Lines64–74 grant learner/learner_course continuity only to a two-party private audience. Lines75–86 require current project readers and return course_shared, session and agent_role for the multi-Agent group. Therefore the old first-grant learner assertion was incompatible with the new contract. The group test now explicitly forbids private scopes, compares the named agent_role partition across Agents, requires one shared scope for this same tenant/project, and tests current membership removal and restoration through the real public memory API. Existing mention dispatch, shared principal, attachment inheritance, replay and hidden-child checks remain.

Official 3.5.8 `dist/src/memory/access.js:76–88` keeps grants without continuity in the native IM partition (including audience and policy), while principal continuity uses stable-memory. A role scope may change between two works for the same Agent, so every observed role scope is checked for exclusive Agent ownership instead of imposing personal-style stability. The evolution test uses two actual private rooms for the same authorized learner and requires identical stable learner scope; it does not copy a scope hashing algorithm or fabricate a grant.

Official `dist/src/memory/processor.js:164–191` requires an independent verdict with **approved, complete and confidence**. The old scripted model omitted complete, so after fixing the scope assertion it caused a bounded format-repair call. The fixture now explicitly certifies coverage of its known synthetic page. The original **one proposal and one independent review** assertions remain exact, as do all checks for empty candidates not registering a benchmark, committed apply receipts, nonempty benchmark freezing, synthesized documents and inactive candidates with pending evaluation.

## Executed evidence

| Run | Result | Test-runner duration | Meaning |
| --- | --- | --- | --- |
| `red.log` | 2 passed / 2 failed / 0 skipped | 11.944s | Unchanged owning files reproduce exactly the old group scopeTypes and personal im-memory-prefix failures. |
| `intermediate-fixture-red.log` | 2 passed / 2 failed / 0 skipped | 14.279s | The added same-Agent role stability assumption was too strong; the original synthesis verdict omitted complete. Exact intermediate test sources and receipt are retained. |
| `artifact-path-collision.log` | 3 passed / 1 failed / 0 skipped | 16.928s | All changed behavior passed; the unchanged introduction test's exclusive artifact write hit an existing output path. This is a fixture output-path failure, not a product failure. |
| `green.log` | **4 passed / 0 failed / 0 skipped** | **12.632s** | Entire two owning files run serially with a new output directory. |

`green-evolution.json` confirms each empty/nonempty pass has exactly one proposal, one independent review and one successful apply receipt. Empty: zero benchmarks/candidates. Nonempty: one benchmark, one inactive candidate with pending evaluation. `green-group-*.json` retain checks and synthetic run identities; raw synthetic conversation artifacts remain privately under `/tmp/pr236-scope-contracts/green-final-artifacts` and their hashes are recorded. No memory or prompt bodies are added to public evidence.

Affected-file lint and complete server typecheck passed (`lint-final.log`, `server-types-final.log`). The exact tests, production contract and official package files are hashed in `source-proof.json`; all evidence is hashed in `manifest.sha256.json`. Original CI diagnostics are separately retained by the integrator at `/tmp/lingxi-225-219-preparation/combined-ci-integration-failed.log` (CI 39403218974); this four-test result does **not** claim the full combined CI suite passed.

## Isolation, reproduction and cleanup

Tests used only new database `lingxiloop_pr236_scope_20261020_test` on existing loopback PostgreSQL port55432, and an owned Redis fixture on loopback port56436 using the already available image (no pull). The normal migrator installed product48/runtime3.5.8/schema13 and subsequent migrations were no-ops. The existing local test password was used only in process memory; no credentials were created, printed or copied. All files ran serially through the repository's normal runner. Models and IM were deterministic fixtures; provider base URL was disabled loopback and embeddings disabled.

For reproduction, create another exclusive test database, run the normal migrator with its DATABASE_URL, and run:

```sh
# INTEGRATION_DATABASE_URL and REDIS_URL must point only at your isolated fixtures.
RUNTIME_ACCEPTANCE_OUTPUT_DIR=/tmp/pr236-another-unique-run npm run test:integration -- \
  --file group-mentions.test.ts --file memory-evolution-registration.test.ts
```

Use a new artifact directory for every run: the original mention tests intentionally use exclusive writes. The private execution runner and ownership receipt are retained under `/tmp/pr236-scope-contracts`; the source-proof receipt hashes that runner.

All test processes ended. Only the owned test database was dropped after proving zero remaining connections. Only owned Redis container `e7f9a7233efaa99cc2f75147eeef6b2daac5ffe458a528a016a937a542474a03` was stopped and removed; port56436 is closed. `cleanup.json` and `redis-stop.json` record the outcome. No other task's database, container, production state or retained evidence was changed. No browser, npm installation, build, publish, merge or deployment was performed.
