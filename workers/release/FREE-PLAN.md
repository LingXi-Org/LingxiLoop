# Free-plan release stages (#495)

The account owner confirmed Workers Free on 2026-10-26. No purchase, billing
change, extra service, credential or security exception is part of this change.

Cloudflare's published limits apply to a whole Workflow instance: 50 external
subrequests, 10 ms CPU per step, 1,024 steps and three-day completed-state
retention. Free also has 100,000 invocations/day shared with Workers, 3,000
Workflow steps/day and 1 GB-month Workflow storage. Durable Objects and R2 have
their own free allowances. These are account-level limits, not reservations for
this application. Other applications consume the same account allowances.

- https://developers.cloudflare.com/workflows/reference/limits/
- https://developers.cloudflare.com/workflows/reference/pricing/
- https://developers.cloudflare.com/workers/platform/limits/

The previous single forward/recovery runner needs at least 50 host requests for
sixteen host phases and manifest installation, before public probes and Worker
version checks. A durable step does not reset that limit. Long polling alone
reduces repeated observations but cannot make the complete monolithic recovery
fit. The historical failure occurred near request 51; its raw provider error was
not retained, so that timing is supporting evidence rather than proof of the
original exception text.

## Bounded business units

One release still owns one immutable manifest, generation and resource lock.
The SQLite ledger now records a finite plan: batch/manifest persistence,
manifest installation per host, artifact preparation per component, atomic
resource claim, maintenance isolation, database safety checks when required,
apply and verify per component, restored admission, public probes per component,
and final acceptance. A known failure schedules a finite compatible-recovery
plan with the same release, generation, original error and exact host keys.

Each semantic stage has a conservative allowance of 32 external fetches. The
ledger charges before dispatch; a lost permit reply can waste capacity but never
adds it. The allowance and original operation deadline survive replay and
operator resume. Exhaustion blocks with locks held. It never creates a new stage
or Workflow to retry the exhausted work. A successor is committed only when a
business stage completed or a known failure authorized the separate recovery
plan. Its predecessor is fenced immediately, and the dispatcher observes the
previous provider instance terminal before starting it. Unknown effects and
401/403 do not authorize recovery or a change of credentials.

Hosts obtain missing Docker-save gzip parts through the existing authenticated
private R2 API. The fixed host policy determines the HTTPS origin and local token
file. The existing immutable manifest determines digests and sizes. Completed
parts and qualified images are reused; the Workflow does not relay image bytes
or make one external request per part. This is an artifact preparation job,
independent of the release control job. Both still consume the account's actual
Workers/R2 allowances. No public bucket or alternative identity is introduced.

Every host phase queries its same key before a possible POST, waits up to 45
seconds per authenticated GET, validates the receipt identity, and stores the
receipt before advancing. Parallel isolation waits for all outcomes; one known
failure cannot hide an unknown peer. Docker load uncertainty remains observed,
never replayed. A prepare process crash with an unfinished download remains an
explicit reconciliation boundary; the API does not silently restart it on GET.

## Existing in-flight state

A legacy owned release can be adopted only for read-only final verification,
with exact successful prepare/drain/apply/verify/undrain receipts for every host,
the original manifest hash and generation, and a final probe/step uncertainty.
This path retains all receipts and skips host manifest installation, preparation,
claim and mutation. Other legacy states block for explicit reconciliation. A
fresh candidate must match the current controller Ops SHA. No successful
production action is replayed to qualify the new code.

Authoritative records and immutable receipts remain in SQLite/R2; the Workflow's
three-day retention is not a recovery data retention policy. Do not delete old
manifests, compatible images, volumes or checkpoint evidence to fit a quota.
If daily CPU/request/step/storage capacity is unavailable, retain state and wait
for the normal platform allowance or reduce actual workload. Never rotate
accounts, restart exhausted work, downgrade TLS or buy an upgrade implicitly.

## Validation and production gate

`staged-release.test.ts` executes the deployed runner against actual SQLite DO
persistence with injected network responses and immediate waits. It verifies
forward and recovery terminal states, unique host writes, exact receipt adoption,
unknown/auth lock retention, persistent request/deadline budgets, old-owner
fencing, predecessor termination and lost-create reconciliation. Those are
isolated regressions, not production receipts. `legacy-workflow.fixture.ts`
retains v1 failure replay tests only and is absent from the production entrypoint.
Production still requires fresh accepted and automatic recovered evidence before
conditional legacy retirement. Keep CI's automatic registration disabled until
that qualification and exact Ops-variable synchronization are complete.
