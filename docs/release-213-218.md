# Release coordination: issues 213–218

Baseline checked on 2026-10-20: product main
`b7b165fd704f8d1f22fe8b70b47bfc8d70e02275`, deployed source
`2ea8615c17c9ed11b769c83c699719dc01c11ee4`, published LingxiOS `3.5.6`,
product migration 46. This is a delivery plan, not acceptance evidence.
Issue 219 is requirements-only and is outside this implementation scope.

## Ownership and integration

| Issues | Primary implementation scope | Shared boundaries |
| --- | --- | --- |
| 213, 217 | ConversationThread scroll controls; MentionBadge and composer mention names; GenUiCard toolbar and rounded surface; visualize historical loading and prompting | Own scroll-control sections of ConversationThread; coordinate markdown mention callsites with 214; preserve visualization validation, source/origin checks and current authorization |
| 214 | Official StreamingText source, Chinese segmentation and Markdown integration; streaming-specific chat styles and fixtures | Own markdown-text streaming/rendering sections; preserve 213 mention renderer contract and 215 stable text-part IDs; do not replace the transport |
| 215, 218 | Public commentary lifecycle and persistence; native projection/transport adapter; runActivity classification; NativeTool, MemoryTool and official component mapping | Own activity sections of ConversationThread; only minimal public runtime additions if existing 3.5.6 APIs cannot preserve published commentary; coordinate memory result shapes with 216 |
| 216 | LingxiOS memory domains, extraction, indexing and forgetting; Loop memory authorization, actual course identity, embeddings configuration and product entrypoints | Own memory portions of runtime.ts; retain existing public operation cancellation/deadlines and shared ledger; coordinate MemoryTool display contract with 218 |
| Sole integrator | Final shared-file resolution, upstream release versions, exact package locks, product migration numbering, exact-commit review/CI, serialized rollout and acceptance | Authors provide draft PRs; no independent merge, package publish, deployment or issue closure |

The next product migration number, **47**, is reserved for issue 216 if its
implementation needs a product migration. Issue 215 should first reuse existing
durable public presentation/message storage. If evidence establishes additional
DDL is necessary, the integrator assigns numbering against current main before
either branch lands. Runtime schema migrations belong to the upstream repository.

The next formal runtime release number is allocated only by the integrator.
Authors must not concurrently publish or tag competing 3.5.7 packages. Independent
UI delivery may stay on 3.5.6. If public commentary needs an upstream release and
is ready before memory, release that compatible change first and rebase memory
onto it; otherwise integrate compatible upstream changes into one reviewed formal
release. Product locks must point to an actually published immutable package.

## Release order

1. Review each independent draft and its baseline/reproduction evidence. Integrate
   ready UI fixes first, with a combined mention/streaming/activity check for shared
   renderers. A UI wave need not wait for the cross-repository memory feature.
2. Integrate public activity and tool cards, including replay/history and failure,
   cancellation, attention and final-answer visibility. Publish a runtime addition
   first only if the public contract requires it. Preserve exact package locks.
3. Deliver both phases of issue 216 together: stable ownership and current audience
   authorization, legacy migration, explicit committed facts, complete bounded
   long-message processing, actual configured semantic indexing/backfill, bounded
   context selection and forgetting consistency. API-only or default-disabled
   semantic integration is not acceptance.
4. Run affected short owning checks and exact-commit independent review/required
   CI. For each release wave, verify immutable image identities, actual Komodo
   `Complete`/`success: true`, both Web and Worker health, relevant HTTPS and schema
   provenance. Close only the issue acceptance actually demonstrated.

Before any runtime schema upgrade, follow the production skill: a consistent
backup restored into an isolated database, old Workers drained with no live
leases, then ordered migration/deployment and installed-schema comparison.
An older SQL observation does not satisfy a new migration gate. Existing fixed
3.5.3 soak and automations remain untouched; no new long soak is required.

## Evidence and regression contract

- Record exact baseline/candidate SHAs, environment, sample count, input sizes and
  timing boundaries. Reproduce the failure before the fix. Synthetic, real-provider
  and production observations remain explicitly distinct.
- Issue 217 records navigation to actual content and interaction, cold/re-entry/
  warm/switch/multiple-card cases. Loading placeholders are a separate metric.
- Issue 215 records submit to first public text separately from received increment
  to rendered text; targets are feedback under 1 second and render under 300 ms.
  Preserve ordering and published text through tool calls, retry and history.
- Issue 214 compares the actual official source/effect with the product using the
  same inputs. Chinese, Markdown, exact whitespace, final/cancelled/history states
  and reduced motion remain intact. Do not introduce a second animation engine.
- Issue 218 inventories actual tool/event identities and maps each known family to
  an official component, with source/license/commit and minimal adaptation noted.
- Issue 216 proves actual model input and answer use committed facts, authorization
  and revocation, real-course boundaries, migration idempotency, long-message tail
  coverage, current semantic index/version, restart/retry and forget non-resurrection.
- Browser evidence uses tester-army/e2e and @e2e-dev/web. Preserve assertions and
  meaningful owning integration; no new skips or timeout increases to fake success.
- Logs contain timings, counts and safe identifiers only; no memory bodies,
  credentials, private reasoning or prompts. Real-provider limitations are reported
  without substituting a fixture or blocking unrelated release waves indefinitely.

## Methods applied

[Claude's performance article](https://claude.dev/blog/how-we-made-claude-ai-faster/)
informs journey-level timing, comparable before/after measurements and checking
that cheaper proxy counts correspond to actual user-visible improvement.
[OpenAI's maintenance article](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)
informs ownership-separated work, tracing indirect consumers/history, retaining
operational safeguards, small reviewable changes and prioritizing measured costs.
Neither article's reported gains are evidence of gains in this project.
