# Organization case library — #187

This branch adds an organization article library and applies the updated, already-closed #121 forum scope. It does not deploy or reopen #121.

## Behavior and boundaries

- Main-rail `/cases` and `/cases/:id?company=...` navigation, editorial cards, article details, keyword/category filters, responsive light/dark layouts, keyboard focus and history restoration.
- Organization teachers maintain any case across courses. Students receive only the published snapshot; saving a draft does not change public text, search, images or retrieval. Explicit publication creates a new immutable knowledge source version. Unpublish invalidates its source and job transactionally.
- Dedicated `cases:read`/`cases:manage` policies retain membership, organization lifecycle and entitlement checks. The ordinary knowledge-resource permission path excludes case sources. Managed images require both organization access and a reference from the current published snapshot for students; generic upload grants cannot bypass that gate.
- Existing Open Notebook ingestion, bounded retries and deferred deletion are reused. Organization sources are searched separately from course/private sources. The existing audience intersection is preserved, and published source identity and audience access are rechecked after external search.
- Teacher operations lock ingestion jobs before sources, matching the worker. Real transaction interleaving verifies publish/unpublish/retry do not deadlock with completion.
- Forum navigation now contains all/assignments/discussion only. Existing source-library management, homework provenance, Agent evidence, private attachments and submission histories remain independent.

## Verification

| Check | Result |
| --- | --- |
| Web tests | 88 passed |
| Server tests | 106 passed |
| Migration + case integration (before reserved-number change) | 34 passed, including 27 migration tests |
| Final case/knowledge/forum integration | 26 passed: 8 case, 8 knowledge, 10 forum |
| Official case browser E2E | 2 passed, 8 screenshots |
| Official forum scope browser E2E | 1 passed, 3 screenshots |
| Web typecheck, lint, build | Passed; existing lint/chunk-size warnings |
| Server lint | Passed |
| Server and E2E typecheck with root lockfile dependencies | Passed |

The selected environment has both root and `server/node_modules`. Their existing lockfiles resolve Zod 4.4.3 and 4.5.4 respectively, and different Node type declarations. A mixed-tree typecheck fails in existing runtime/shared-schema files. Root-only qualification temporarily moved the nested dependency directory outside the repository, ran both standard typecheck commands, and restored it. No manifest or lockfile was changed. New runtime dependencies are resolved from the server manifest: `mdast-util-from-markdown` was already present; no frontend-only visitor dependency is required.

Evidence: [integration](integration.log), [migration verification](migration-and-cases.log), [web tests](web-tests.log), [server tests](server-tests.log), [server typecheck](server-typecheck.log), [E2E typecheck](e2e-typecheck.log), [build](build.log), [case browser report](../../../artifacts/cases/browser/summary.md), [forum browser report](../../../artifacts/issue-187/forum/browser/summary.md). Browser reports retain JSON, JUnit and screenshots beside the summaries. Fixtures use real HTTP routes and PostgreSQL, synthetic identities, recorded IM and in-memory object storage; browser responses are not mocked.

## Integration handoff

The release integrator assigned **0044 to #183** and **0045 to #187**. This branch therefore contains `0045_organization_cases.sql`. At handoff, `origin/main` (`97441ba3`) contains migrations through 0043 and #183 has not yet supplied its 0044 asset. The production migration runner correctly refuses that gap. Do not add a placeholder or relax its contiguous-sequence check. Integrate #183's real 0044 before this branch, then run migration and the owning suites twice/no-op against a fresh disposable database. The previously recorded case migration/no-op runs used this same SQL under its initial 0044 number; they are not evidence of the final combined 0044→0045 rollout.

The migration test expectations recognize the actual 0044 filename supplied by release integration and retain exact 0045 assertions. The 0045 upgrade fixture starts after 0044, preserves old private/course sources, rejects cross-organization case/image references, and verifies no case is automatically created from existing content.

Potential shared integration files: `DesktopApp.tsx`, `WorkspaceRail.tsx`, navigation/types, `server/src/api/router.ts`, `files-router.ts`, and `migration.test.ts`. No `ForumComposer`, publishing canvas or homework evidence implementation was rewritten; #184 should retain its publishing component changes.

After the actual 0044 dependency is present, reproduce with:

```sh
node e2e/server/run.mjs --file organization-cases.test.ts --file knowledge-vertical-slice.test.ts --file course-forum.test.ts --file migration.test.ts
XDG_CACHE_HOME=/workspace/.cache node e2e/server/cases.mjs --browser-only
XDG_CACHE_HOME=/workspace/.cache node e2e/server/forum.mjs --browser --issue187
```

The first command's runner now recognizes both Node 22 TAP summaries and Node 24 `ℹ` summaries, so successful tests are not recorded as zero-pass failures. The browser runners migrate twice. At the initial handoff, live Open Notebook/SurrealDB service availability and production deployment had not been exercised. The original worker/search tests used a recording provider and real PostgreSQL; the supplemental live-service qualification below now covers the local service boundary. Final release qualification remains with the release integrator.

## Agent evidence repair and live-service supplement

Commit `f5c9a3034d21c42945fa21c39b0fe8de0cfacdb4` repairs the dedicated case
source/version path in knowledge tools and context authorization, retaining the
generic knowledge policy's case exclusion. [Reproducible live-service evidence](live-case-agent/README.md)
now qualifies actual Notebook HTTP → SurrealDB → Agent ingestion, search and
authorization with synthetic data. This supplements the earlier handoff's pending
local-service check: 48 owning integration tests and one live case scenario passed,
all with zero skips. It uses public LingxiOS 3.5.2 and synthetic embeddings; final
3.5.3 acceptance and production deployment remain outside this evidence. The real
0044 was used locally but is not included in the evidence commit.
