# Explicit result producers — issue 304

Written before implementation on `d5481cd258058784e7004169b5ef1235460384f1`.

- A research search used as a step must declare process purpose; an explicitly
  requested source list must declare result purpose. Neither Chinese text nor rich
  UI appearance may supply this distinction. Unknown enum values must fail parsing.
- Native memory remains on formal runtime 3.8.2. A requested memory result must use
  an exact observed memory ID, never a query, an arbitrary object, or a corpus scan.
- Presentation registration must retain a concrete capability gate. Runtime 3.8.2
  presentation gates check the product catalog, so native `memory.read` cannot be
  used as its action. The minimal product read `memory.summary` supplies the gate
  and reuses the existing native authorized reader; there is no empty-actions bypass.
- Authorize and resolve each reread the exact ID through the existing native
  scope/audience resolver. Revocation, absent/inactive documents, invalid IDs and
  cancellation fail closed. No cached authorization carries between these calls.
- Only public summary chips and their actual versions are serialized; bodies,
  sources, prompts and scope IDs remain private. Source observation time is the
  actual successful read time, not invented document metadata.
- The renderer reuses MemoryTool and its current authorization-aware reread and
  read-only behavior; a result card cannot grant mutations or bypass stale access.
- The exact teacher read exception includes only `memory.summary` in a normal
  interactive turn. Teacher room and current audience checks still run; internal,
  routine/background requests and other memory actions do not gain this exception.
- Product capability construction keeps the existing single native memory grant;
  a new summary-only namespace grant must not shadow the native read/write methods
  under the runtime's first-match control-plane authorization.
- Ordinary memory activity remains process, while final native presentations are
  explicit results. Strict generative schema permits only the existing chip shape.

Evidence consists of controlled local tests and root's integrated browser flow.
No production request, private-record read, GitHub mutation or deployment is run
from this worktree. Existing production 403/1010 and GitHub 401 restrictions remain.

## Focused test receipt

- Baseline: the first two producer tests failed as expected (no declared search
  purpose and no memory result definition); the copy test exposed process text in
  copied answers. The teacher regression first failed on the missing exact read
  exception, while prohibited teacher cases already passed.
- Candidate: 9/9 passed across `result-producers.test.ts`,
  `memory-result-authorization.test.ts`, `agent-tool-registry.test.ts`,
  `memory-scopes.test.ts` and `src/lib/nativeText.test.ts`, with no skips.
- These use the real product authorizers, existing scope resolver, strict parsers
  and formal 3.8.2 `assembleHarness`; underlying memory/DB reads are controlled
  fixtures. They do not claim a production read or a live runtime execution.
- Node 22 command: `node --import tsx --experimental-test-module-mocks --test
  --test-force-exit` followed by those five files, using the repository's ordinary
  unit-test environment defaults. Frontend result routing and browser interactions
  are verified on the root integration candidate, separately.
- Web TypeScript and focused Biome lint passed. Server TypeScript is checked after
  the final capability-grant adaptation; the root receipt records the final result.
- Review corrected the teacher fixture to the real, type-checked `TeacherScope`
  shape. Stronger project assertions first reproduced two failures with the old
  mock (`projectId` and project resource ID were undefined). The corrected tests
  verify exact `learning:manage` project identity for both the read tool and
  presentation authorize/resolve, and reject revocation before any memory read.
