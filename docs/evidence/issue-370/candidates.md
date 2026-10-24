# Maintenance candidates

Baseline: `190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9`, 2026-10-24.
This is a bounded cross-module inventory, not a proof that the entire repository
is free of unused code. Priority considers demonstrated benefit, risk and the
cost of verification. CPU, image-size and latency savings are unknown unless
measured below. Historical receipts remain historical.

| Priority / owner | Candidate and current purpose | Evidence / status | Benefit and risk | Verification / disposition |
| --- | --- | --- | --- | --- |
| P1 / #371 | `scripts/ci-scope.mjs`, integration runner and `ci.yml`: test selection and release gates | Ordinary server source selects all 119 integration files; successful main job 918s, test step 817s. See [CI evidence](ci/README.md). | Largest measured critical-path opportunity; coverage and release-gate risk. | #371 owns these files, default lists and fixtures. Compare successful equivalent scopes and retain auth, idempotency, streaming and recovery checks. No edits here. |
| P1 / #370 | `AGENTS.md`: permanent rules mixed with an expired session | The 2026-10-19 section explicitly limits its own authority. [Archive](session-20261019.md), [bounded comparison](replay/README.md). | Remove misleading active context; instruction-quality effects need evidence. | Preserve product/data/release invariants; compare one verification instruction before deciding. |
| P2 / #370 | Orphan `CheckpointHistory` view | Unique tool import/registry/converter removed by `b97299cc`; current direct/dynamic entry scans and independent review find no consumer. [Full evidence](cleanup.md). **Confirmed; implemented.** | 99 source lines / 2,993 bytes removed; low risk. No bundle/CPU saving claimed. | Existing Web lint, build/typecheck and tests; restore the baseline file to revert. |
| P3 / future Server owner | `server/src/llm.ts` exported `createImage` | Avatar consumer removed by `f3c22ae6`; last dynamic CLI consumer removed by `d8da5f99`. Current `llm.js` consumers call chat/embedding only; private server package has no exports and tools use explicit registration. **Confirmed; deferred.** | Six wrapper lines plus one private union member; small benefit, shared billing-path verification cost. | Keep this PR narrow. Future owning checks: server types/lint and existing LLM recovery/ledger/timing/observability tests. Keep SDK image instrumentation. |
| Retain / Web | `ProgressCard` | `BusinessMessagePart.tsx` renders it for `tool-activity` data. | Active persisted-message consumer. | Retained; a simple import-name count would miss the message contract. |
| Pending / Web artifacts owner | `AgentStatus` | Tracked `artifacts/playwright/host-protocol-ui-review/main.tsx` imports and renders it. | Removing it may break a reproducible review surface. | Retain until the artifact's lifecycle and replacement are established. |
| Retain / Admin-Control | `DashboardError`, `RecordCover` | Same-file consumers remain in Admin views. | Internal symbols are not automatically unused exports. | Retained; no cleanup or behavior change. |
| Pending / Server | `personaCache/getPersona` | Onboarding facade still injects invalidation across modules. | Consumer/effect graph incomplete. | Retain pending full lifecycle trace. |
| Retain / Server | `llm-client → instrumentOpenAIClient → images.generate` | Current SDK instrumentation and its owning test exercise the image path. | Billing/observability compatibility matters independently of the dead wrapper above. | Retained. |
| Reuse / #370 | `docs/evidence/issue-201/collect-ci.py` | Existing metadata-only collector distinguishes runner time from wall time. | Reuse collection semantics; its whole-workflow totals alone cannot measure the checks-only goal. | Historical sample adds attempt, event, footprint and selector revision grouping; no job-log access. |
| Retain / shared runtime | Formal LingxiOS pin, public-text readers, historical migration fixtures | Published 3.8.11, native schema14 and public reader3 retain old-data/restore contracts. | A retired producer does not make historical readers or migration checks dead. | No runtime, schema or fixture changes. Fixture selection belongs to #371. |
| Retain / infrastructure owners | WuKongIM, PostgreSQL, Redis, Open Notebook and rollback controls | Independent product data/service boundaries; prior #229 packaging work is already delivered. | External consumers and recovery paths need dedicated evidence. | No inferred deletion or live configuration change. |

## Reproduction

```sh
git log -S'CheckpointHistory' -- src
git show b97299ccb1b15e5a49ef5c9b55119f0380f7684c -- src
rg -n 'CheckpointHistory|checkpoint-history' src admin electron workers scripts
rg -n 'createImage|llm\.js' server/src
git log -S'createImage' -- server/src
```

The empty executable search after deletion is expected. It supplements the
registry, build-entry and history evidence; it is not the sole deletion proof.
