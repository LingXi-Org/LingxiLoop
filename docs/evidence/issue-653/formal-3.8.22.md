# Formal 3.8.22 product stage timing qualification

This extension builds on PR #654 at 53e1c804c48e9bde34b1d76bbf2c1aedaa99c184.
Keep that queue/execution baseline separate from this exact dependency upgrade.
Neither an SDK publication nor these local tests establish production deployment.

## Published public boundary

The root, server and generated build manifests/locks pin `@lyyzka/lingxios`
3.8.22, registry artifact
`https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.22/fc8c4cbbf20550b87c414231f1faec7446e72f52`,
with independently checked archive integrity:

```
sha512-Sj/ZTZx4exeZMiwQn4UoQf5wYkylkLLBYHSduPp+EMhrKxpqM45G8wr1+UpBBtEZO5o6gNeiSvPD+Eca2uZXHA==
```

Public contract:
<https://github.com/LingXi-Org/LingxiOS/blob/v3.8.22/docs/contracts/model-stage-timing-v1.md>.
Product code imports only public exports. The existing shared LLM callback stores
closed `readModelStageTimings` output with fence/requestVersion. Existing latency,
usage, price, cost and call-id idempotency semantics remain unchanged.

Authorized platform detail, company detail and operations read the product
ledger with company/run/agent/principal/session/thread binding and current
requestVersion. Failed generation/correction calls remain separate. Public
`readDiagnostics` supplies closed `readPublicTextPublicationTiming` snapshots;
select highest revision within call/fence/requestVersion, never sum revisions.
Both readers are bounded to64 measurements, report truncation/unavailability,
and retain unknown historical fields instead of inserting zero.

The admin card shows settled per-call model permit wait, HTTP milestones,
observed stream, callback sum/union and validation, separately from output ACK
sum/union/count/failure. These monotonic intervals overlap. ACK time is neither
DB CPU time nor IM/user delivery; provider-only inference and unattributed run
time remain unavailable. Settled permit wait does not identify a current waiter.

## Exact installed product61 transition

The SDK SQL schema hash remains
`c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`
(native14/protocol11). The new deployment plan permits only exact21→22 over the
same complete product61 migration inventory. CAS provenance, maintenance/drain,
retained resumable-work rejection, exclusive-client fencing, uncertain-COMMIT
observation and read-only target startup remain required. No target migration,
DDL, seed, fresh install, source adoption or skipped20→22 is authorized here.
Original20→21 coverage runs under an isolated actual formal21 archive; it is not
replaced by a target-runtime imitation.

## Local product validation (2026-11-03)

Node22; isolated disposable PostgreSQL16/Redis7 on loopback, test database only.
Actual formal21 test bootstrap precedes exact21→22 CAS. No external model is
called. The real SDK Worker, product authorization, shared ledger and PostgreSQL
are used with synthetic loopback HTTP/WuKong delivery fixtures.

- Shared ledger test: same call ID preserves137ms,10/20tokens and$0.000123 after
  duplicate callback; failed correction retained; other requestVersion and each
  foreign identity component excluded; legacy fees/usage retained without timing.
- Public-text suspension: ordinary success,1200ms delayed delta ACK success and
  rejected seal failure. Actual SDK observations reach the ledger; the tool-only
  stream has no fabricated content-first zero;1250ms stream pause and delayed ACK
  appear in their own fields. Authorized public publication diagnostics retain
  seal/persistence_rejected, no successful result on seal rejection.
- Authorized HTTP diagnostic regression retains401 and company redaction while
  exposing empty available stage collections for pre-model failures.
- Recovery regression15/15: bounded transient/quota/exhausted attempts and native-v1/v2/v3
  complete/correction/finalize/fail-all retain one effective answer and replay identity;
  actual generation/correction stage records match the shared ledger. Native authorization
  faults3/3 and authoritative provider-pricing ledger1/1 also passed.
- Actual formal22 CAS qualification: complete61 provenance-only change,
  no target DDL/product writes, fresh/partial58/59/60 rejection, retained Slides
  checkpoint rejection and uncertain-COMMIT observation; original formal21
  qualification retained separately.

Focused projection/UI tests passed12/12; server smoke passed176/176;
server typecheck/lint, admin typecheck/build/lint passed (existing informational
lint notices and bundle-size warning remain). Deployment/CI-scope/bootstrap
contract tests passed, including new stage owner selection. Final candidate CI
and independent review are recorded in the PR rather than inferred here.

The local fixture initially needed explicit synthetic token prices because the
product execution budget requires configured rates; no production budget was
changed. Recovery fixture expectations must follow formal22 native-v3
`tool_choice=required`; native-v1/v2 preserve their existing bindings.

## Remaining release boundaries

A real-provider protocol/performance regression, frozen-root/shared quota
capacity baseline and confirmed production host single-writer handoff remain
unverified. No concurrency, model quota, root execution budget, embedding routing,
production credentials or live deployment is changed by this qualification.
Only the designated sole integrator may merge and coordinate release.

Final independent review of code candidated37b725b found no P0/P1/P2 blockers.
The stage integration is PR #659, dependent on #654. It targets main for the
normal owning CI; merge #654 first and refresh this branch before integration.
The complete baseline diff must not be mistaken for duplicate feature work.
