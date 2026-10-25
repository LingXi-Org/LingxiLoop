# Issue #439 — student learning dialogue investigation

## Evidence and scope

This investigation starts from `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`
on `fix/439-learning-dialogue-submission`. The report says a student admitted to
a course cannot complete a learning dialogue because assistant replies fail,
which prevents citing the dialogue in an assignment submission.
The final draft is rebased onto `b7e8bf8aa111fd84f7d92a5a114a0e3444b35217`,
including the separately owned quoted-retry fix from PR #456.

**Outcome:** this draft fixes the observability gap at the context-loading error
boundary and retains the bounded student-path regression. It does not establish
or fix the original incident's root cause; #439 must remain open.

Incident-specific operational records remain in the private handoff. This public
evidence contains only implementation facts and synthetic qualification results.

The quoted retry pattern overlaps issue #447, owned by another environment.
Its message actions, quote ingress, runtime history, transport, and quote-preview
boundaries are not changed here. A generic failed-reply label cannot distinguish
authorization, runtime/model protocol, dependency, or tool failure, so it is not
evidence of a unique cause.

## Source findings

- `ContextThreadsApplication.createLearningThread` creates a deterministic,
  company/project/student/agent-scoped private conversation and validates the
  active learning agent. The central policy permits students to read/write their
  authorized conversations and read learning content.
- The existing native-admission/context integration fixtures primarily exercise
  a teacher principal. They do not establish that a freshly admitted student can
  obtain a durable normal reply through the same path.
- `ConversationReferences.tsx` offers a completed student/assistant exchange.
  `forum-evidence.ts` checks access, resolves canonical messages, omits empty
  message bodies, and requires the selected evidence to start with the student
  and end with an assistant. Failed turns with no assistant body therefore leave
  no eligible exchange.
- `forum-application.ts` checks current course membership, publication state,
  and canonical references when submitting. There is no source-level rule that
  disqualifies a student merely because the assignment predates admission.
  Homework submission additionally binds references to its private homework
  channel and report evidence. These rules are preserved.
- Both assignment kinds remain available in the UI: the main `CourseForum`
  “发布作业” action creates/publishes through `HomeworkApplication`; the inline
  forum composer also offers a forum assignment. The screenshot identifies
  neither kind. The single regression targets the main homework route rather
  than running a second assignment matrix.

The source inspection found no independent student-authorization or submission
defect. It supports testing a normal student reply before attributing the incident
to a citation or submission bug. Existing browser coverage already exercises
incomplete evidence becoming selectable after a completed reply and refresh;
that broader suite is not repeated here.

## Bounded qualification

The single scenario in
`server/src/__integration__/student-learning-dialogue.test.ts` targets the primary
homework route:

1. Create a homework draft, execute its validation effect with a local
   deterministic model response, and publish through `HomeworkApplication`.
2. Admit a new student through a course invitation after publication, then start
   the homework's private `HOMEWORK` conversation through the application.
3. Commit an unquoted student message, admit it through product ingress, and run
   the published LingxiOS 3.8.12 worker with a deterministic local model.
4. Observe a successful delivered run, one canonical assistant reply, a product
   LLM-ledger entry, readable canonical student/assistant evidence, and
   `hasLearningRecord` in the homework's student state.

The product authorization/context/delivery integration is real. Model responses
and the external IM service are deterministic local fixtures. The initial pass
also inherited the integration runner's disabled embeddings, so it did not
exercise production semantic recall. No
successful validation, assistant-message, or report row is inserted to manufacture
a pass. The scenario makes no external model calls and cannot establish live
provider acceptance. All accounts, coursework, and messages are synthetic.

Report generation, final homework submission, the secondary forum-assignment
route, quoted retries, and the browser UI are **not exercised** by this one
scenario. In particular, readable canonical evidence alone is not a submitted
homework or a verified learning report.

Owning command:

```sh
npm run test:integration -- --file student-learning-dialogue.test.ts
```

The command uses an isolated test PostgreSQL database migrated through product
schema `0056` and dedicated Redis. No ambient production connection is used.

The first run returned 0 passed / 1 failed (6.48 seconds overall, 1.99 seconds for
the scenario). The native worker reached `succeeded` and `delivered`, then the
assertion looking for the bound homework title failed. The fixture had omitted
the `ProductRuntimePolicy` that the production worker installs; the upstream
default policy does not project product dynamic observations. The test now uses
the actual product policy and checks both formal model-request fields,
`instructions` and `items`. This was a fixture correction, not a product fix or
a reproduction of the reported failed reply. Initial log:
`/tmp/lingxi-439-student-learning.log`.

The corrected owning run passed **1/1, zero skips**, in 4.538 seconds overall
(1.481 seconds for the scenario). Its synthetic receipt records:

```json
{
  "modelCalls": 1,
  "delivery": "delivered",
  "assistantReplies": 1,
  "canonicalEvidenceMessages": 2,
  "hasLearningRecord": true,
  "reportAndSubmission": "not_exercised"
}
```

Final log: `/tmp/lingxi-439-student-learning-final.log`. Focused lint passed for
the one changed test file. Final stable `npm run server:typecheck` passed
(log `/tmp/lingxi-439-server-typecheck-final.log`), as did `git diff --check`.
No broader test suite or browser reproduction ran. Exact-commit CI will be
reported separately on the draft PR.

Environment recovery used the existing exact dependency locks. A separate
`server/node_modules` preload produced incompatible duplicate package types;
it was moved to a reversible `/tmp` backup to use the repository CI's root-only
installation layout. No package manifest, dependency lock, source policy, or
runtime protocol was changed to resolve that environment mismatch.

### Qualification of the observed failure stage

To exercise the context-loading stage, the same scenario was updated to enable native embeddings and semantic recall. Only the configured
embedding URL receives a synthetic 1024-dimensional response; other external
requests fail the fixture, and the original fetch function/environment are
restored afterward. The actual embedding driver, budget settlement, semantic SQL,
memory scopes, and product ACLs execute. The fixture also preserves a local
`loadInitialContext` exception before the runtime replaces it with a public
message, so an actual local failure would retain its cause.

The updated scenario passed **1/1, zero skips**, in 4.631 seconds overall
(1.518 seconds for the scenario): one embedding request, one measured embedding
ledger row, completed native semantic recall, one chat-model call, one durable
reply, and two canonical evidence messages. Log:
`/tmp/lingxi-439-semantic-result.log`. The first invocation in the recreated test
environment stopped before executing the scenario because the required
`LINGXILOOP_INVITE_BASE_URL` was absent; using CI's localhost value resolved that
setup error. It was not a reproduction of the production context failure.
The updated file's focused Biome check (including import organization), server
typecheck (`/tmp/lingxi-439-semantic-typecheck.log`), and diff whitespace check
passed. Exact final-commit CI is reported on the draft PR.

This narrows the unverified difference to production-specific context/state or
runtime service behavior. It neither simulates the missing production exception
nor establishes a product fix. Historical private context and real provider
responses were not copied into the fixture.

## Diagnostic implementation and remaining boundary

The formal runtime logs unexpected context HTTP exceptions through its supported
`Logger` extension before returning a generic error to the worker. The public run
error intentionally omits the underlying exception. The product now preserves a
strict metadata projection in the existing restricted audit store, correlated to
the authoritative product run binding. It does not persist error
messages, prompts, credentials, provider responses or arbitrary extension fields.

The existing platform-administrator run detail/operations surface now includes a
bounded `contextFailures` collection. It can also be read through the existing
MCP resource-field tool without requesting message history. Company administrators
and ordinary conversation responses do not receive these fields. Historical records cannot
be reconstructed from a generic error string; no backfill is attempted.

The formal runtime's supported `Logger` interface is decorated before Error
serialization. Only the exact context route is recorded; the decorator removes
raw errors and query strings from control-plane error logs. The record contains:

- A generated correlation ID, exact run ID and `context_load` stage.
- Official fixed reason/category, retryability, an allowed exception name,
  an allowed cause/filesystem code, bounded SQLSTATE and integer HTTP error
  status when available.
- At most four source locations from a fixed module allowlist, without absolute
  paths, function names or raw stacks.
- The formal runtime version and validated service commit, retained across later
  runtime upgrades.

The writer resolves tenant/principal ownership from `agent_run_bindings`. A
failure before binding remains platform-only. The reader receives an identity
resolved by the formal runtime and checks every available product binding field.
Both read/write paths validate the strict schema. Persistence uses `audit_events`
without DDL; pending writes drain during normal shutdown. A database write failure
emits only a fixed failure code and cannot change the original HTTP response.

Source-level dependency boundaries remain relevant for the next diagnosis:
`service.loadContext` validates the lease/session, loads product authorization,
canonical IM history and conditional knowledge/visualization context, then loads
native memory and rechecks runtime state. The student fixture uses recording IM,
empty synthetic coursework/source state and a local vector response. Existing
knowledge sources can activate external retrieval, visualization preparation can
touch its authorized filesystem directory, and populated memory adds record and
admission processing after embedding. These branches are not interchangeable
with a fresh fixture. The formal HTTP client also bounds retries of 5xx/transport
failures, so one run can have multiple context request diagnostics; each record
has its own correlation ID. None of these differences is asserted as the incident
cause.

Validation of this change:

- Focused diagnostic unit tests: **7/7 passed**, including hostile fields,
  private-marker removal, historical versions, writer rejection and a log hook
  that cannot interrupt the original error response.
- One actual formal-runtime HTTP integration: **1/1 passed**, zero skips,
  4.565 seconds overall. A controlled synthetic context exception returns the
  unchanged generic HTTP 500, persists a safely projected audit record, and is
  readable only through the platform-administrator interface. The test checks
  raw message/service/lease values are absent from both durable records and logs,
  rejects foreign tenant/session reads, and confirms company-admin run detail has
  no diagnostic field. No model call is made in this fault-path test.

The diagnostic integration log is
`/tmp/lingxi-439-diagnostic-integration.log`. This fault is deliberately injected
and is not represented as a reproduction of the original reported incident.

If no independently established root cause emerges, the next acceptance step is
one new, unquoted message in the authorized affected assignment/student flow
after the designated release coordinator has deployed the diagnostic increment.
Do not replay historical messages or copy their bodies into a test. Capture its
run ID and, if it fails, read only that run's `contextFailures`, status and request
version. The required fields are correlation ID, stage, reason/category, exception
name, SQLSTATE/cause/filesystem code and HTTP status if present, controlled source locations and service/runtime
versions. A successful synthetic turn alone does
not establish that the reported incident is repaired. Report generation and final
homework submission remain unverified.

No production deployment, production database migration, credential/security
change, authorization relaxation, independent review or broad reproduction matrix
is part of this branch. The designated release coordinator owns deployment, and
issue #439 remains open until the actual failure is diagnosed and accepted.
