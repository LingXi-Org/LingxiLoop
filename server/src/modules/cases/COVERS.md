# Case covers

Saving valid article text records a text snapshot and durable job in the same
transaction. Publishing attaches the published target without waiting for the
model. Draft and published targets are independent; article row versions and
knowledge indexing are never updated by cover completion. The original `cover`
image remains an ordinary case asset and is the UI fallback.

`cover-contracts.ts` fixes content identity to canonical title, summary, category,
tags, validated body projection, and the pinned rules/adapter version. Native
editor block IDs and manual cover URLs do not cause regeneration. A ready job is
reused across identical saves and publication. New snapshots wait two seconds so
rapid edits supersede unclaimed work before model execution. A changed rules version requires
explicit backfill; the worker cancels queued jobs using an older rules identity.

The dedicated worker follows the presentations PostgreSQL lease convention:
bounded admission, case-row locking, unique lease token, heartbeat, generation
fence and bounded retries. It checks the requesting teacher's current permission
before claim and commit. Unpublish cancels pending/in-flight jobs; saving again
or explicit backfill can queue the draft again. The worker never logs provider
messages, generated code, or article text. Generator model calls and attribution
belong exclusively to `../case-covers/cover-generation.ts`.

Configuration (all processes should share concurrency settings):

| Variable | Default | Bound |
| --- | --- | --- |
| `CASE_COVER_ENABLED` | enabled | `false` pauses claiming; saves still persist work |
| `CASE_COVER_CONCURRENCY` | 1 | 1–4 live leases across workers |
| `CASE_COVER_TIMEOUT_MS` | 120000 | 100–300000 ms |
| `CASE_COVER_MAX_ATTEMPTS` | 3 | 1–5 attempts including recovered leases |
| `CASE_COVER_INTERVAL_MS` | 2000 | 1000–60000 ms |

The renderer fails closed if its execution sandbox is unavailable. This records
`renderer_unavailable` without automatic repeated model calls. Fix the runtime
prerequisite before a teacher retries a failed target.

A teacher starts/resumes historical generation with
`POST /api/cases/covers/backfill` and `{ "afterId": "", "limit": 25 }` using the
normal authenticated company context. Continue with the returned `nextAfterId`
until null. At most 50 cases are examined in one transaction; returned counts
are company-scoped jobs. Restarting from the beginning reuses existing successful
jobs and does not reset failures. Failed targets use the explicit retry route.
There is no generation on list, detail, or asset reads.

`retry-cover` requires snapshot kind, fingerprint, expected generation and an
idempotency key. An exact replay reuses the same new generation; stale requests
are rejected. The current authorized preview is retained while a replacement
runs. Asset URLs include immutable job/generation identity and are accepted only
while a selected draft/published target references them. Once replaced, an old
asset URL returns 404. Unpublished reader assets and draft reader requests are
rejected; membership is checked again on every fetch.

Preview responses are sanitized SVG with private/no-store, nosniff and restrictive
CSP headers. Interactive responses are JSON `{html}`; only `CaseCover`'s opaque
sandbox may execute that graph document. No generic upload MIME policy changes.
Assets have database size limits and tenant/case foreign keys and are deleted
with their case. Full code and generation rationale are excluded from article
list/detail payloads.
