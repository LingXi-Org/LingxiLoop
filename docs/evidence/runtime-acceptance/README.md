# Post-merge acceptance and session rejection repair

PR171 repaired a release-blocking discrepancy: the root lock installed LingxiOS
3.5.1, while the independent Docker server lock still installed 3.4.7. The
published image from merge `23888a225fb26fa153d731c14651ca59e4525e95` is
`sha256:0c295e66c29dcceab609c3d1715348bab6a90c6585d1280095cc0a61c33b3f29`.
Reading its public `releaseVersions` reports runtime **3.5.1**, schema **12**.
Both independent locks now agree, and the image build checks the actual package.

[Main CI 39009000704](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39009000704)
passed server 107/107, deployment contracts 18/18, and integration 244 passed,
21 explicitly skipped, zero failed. Image publication and manifest update
succeeded. Komodo rollout failed on the initial read with
`UND_ERR_CONNECT_TIMEOUT` to `ops.christmas1314.xyz:443` after 10 seconds, before
configuration synchronization or a rollout trigger. No update ID exists. The
unchanged control-plane deployment was skipped in this run. This is not a
successful production deployment.

## Full SPA regression

The actual React build, local control Worker/D1 session validation, signed
gateway, product PostgreSQL and a real pinned WuKongIM instance are used.
Six official `tester-army/e2e` / `@e2e-dev/web` cases passed in run
`01a1488a-c8be-7402-b980-aee7f5f3ed05`, with zero retries/failures/skips:

| Scenario | Durable result |
| --- | --- |
| Session restoration, reload, expiry and renewal | 200 → 401 → restored; workspace hidden while expired |
| Network abort before acceptance | Original and subsequent send each have one acceptance and one actual WuKong message |
| Paused local PostgreSQL | Same counts; draft retained; recovery without refresh |
| Real local Web process stop/start | Same counts; draft retained; recovery without refresh; lifecycle timestamps retained |
| Send receives expired-session rejection | Original send stays unsent; next send succeeds once |
| Typing 401 tears down session before the send response | Original send stays unsent after renewal; next send succeeds once |

The last case exposed an actual race in main: teardown could abort the send
before its rejection was persisted, allowing an old outbox entry to replay
after sign-in. The retained [red run](session-race-red/report.json) uses the old
application build and records the failure. The repair persists an identity's
outbox stop before clearing authentication. A late 401 from an earlier user or
sign-in cannot clear the current session. Voluntary logout/scope cancellation
retains its existing behavior. Manual retry still uses the original nonce and
authoritative send-status reconciliation.

[Counts](full-spa/counts), [screenshots](full-spa/screenshots),
[videos](full-spa/video) and [Web lifecycle](full-spa/web-lifecycle.jsonl) are
retained. Counts use exact content matching and the original nonce against
actual WuKong history; no Set or unique-nonce count hides duplicate messages.
Auth races have zero old acceptances/messages and one successful next message.
Reports omit request events, cookies, traces and response bodies. The
[manifest](manifest.json) binds every retained artifact with SHA-256.

The new HTTP regression was red before implementation and green afterwards.
Web lint/typecheck/build passed; [owning Web checks](checks.json) passed 91/91,
zero failures/skips. Existing Biome/CSS/chunk-size warnings were unchanged.

This is post-login/session acceptance, **not captcha/login qualification**.
The ordinary login attempt was blocked by Turnstile (`人机验证失败，请重试`).
Synthetic fixture sessions are signed with the existing test configuration;
real session checks and server authorization remain active. No provider is
called. The Web restart uses the local production source entry in NODE_ENV=test,
not an immutable production Worker or a production restart.

## Directory and authorization

The current 3.5.1 combination passed 17/17 owning integration checks:
directory audience intersection, cross-project/tenant denial, revoked
principal/Agent/reader, missing identity, real SQL statement timeout, native
authorization classification and bounded argument correction. The official
[directory browser run](directory/report.json) passed with two frozen audiences,
two turns each, two model calls per turn, correct visible rooms and durable
replies. [Results](directory/audience-results.json) retain the synthetic IDs.
This fixture uses a scripted model and a recording IM adapter; it is separate
from the full SPA's real WuKong send checks.

## Reproduction

Use Node 22 and the installed lockfile. The existing isolated service setup is
documented in `e2e/README.md`; all database/storage credentials used here are
the repository's synthetic local fixtures. Do not load a developer/provider
dotenv file. Start the local control Worker/D1 and built SPA as usual, then:

```sh
# Replaces the ordinary local API process; API must be stopped before this starts.
ACCEPTANCE_FIXTURE_ROOT=/workspace/LingxiLoop \
  node scripts/runtime-acceptance/spa-web-supervisor.mjs

# In another cloud shell; point the official engine at its installed cache.
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
ACCEPTANCE_FIXTURE_ROOT=/workspace/LingxiLoop \
E2E_BASE_URL=http://127.0.0.1:5180 \
  node_modules/.bin/e2e run --config e2e.acceptance.config.ts --video on

node e2e/server/run.mjs --file directory-audience.test.ts --file permission-resolver.test.ts \
  --file native-collaboration.test.ts --file runtime-tool-recovery.test.ts \
  --file native-authorization-faults.test.ts
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
  node e2e/directory-audience/run.mjs
```

Database suites and the SPA database-pause case must run sequentially. The
supervisor controls only its named local API child process group on loopback.
The synthetic D1 fixture does not modify a remote account or issue credentials.

## Acceptance boundaries

The [prior exact 3.5.1 evidence](../runtime-reliability/README.md) remains valid
for upstream release gates, migrations, 27 reconciliation checks, 20 real-WuKong
checks and 20 recovery/runtime browser cases. This batch adds the actual SPA
checks and fixes a newly discovered authentication race; it does not relabel
those earlier component tests as full-SPA tests.

| Issue | Code and isolated evidence | Remaining acceptance boundary |
| --- | --- | --- |
| #153 | Upstream scheduler, pool/health/config foundation; corrected production image package; actual SPA Web restart and PG interruption | Paired model-dialogue load/retained heap, full Worker restart, complete 24h soak, production Komodo update state |
| #154 | Reconciliation 27/27; real WuKong 20/20; original nonce/result/action/budget preserved; sequence-zero/lost-ACK joint browser recovery; controlled read-only/apply repair tool | No production historical data repair performed; operations is separate from code acceptance |
| #155 | Classified bounded model retries/circuit/fallback/ledger; deterministic 402/timeout and next turn browser checks | Controlled existing real provider/approved route unavailable |
| #156 | Upstream irreducible 0/1-history, schema/request/attachment/window/budget cases; no futile model/compaction calls; numeric diagnostics; context-limit browser continuation | Production deployment tracked by #153; no real-provider result claimed |
| #157 | Atomic concurrent PG child holds/closing reserve and root notice dedup; dimensions/cost/deadline/fanout; five-specialist integration; budget-limit browser continuation | Browser budget case is root reservation rejection, not multi-agent fanout; no live-provider cost qualification claimed |
| #158 | 17 owning integration and two-audience official browser acceptance on 3.5.1 | No remaining issue-specific code acceptance blocker; recording adapter boundary above |
| #159 | Safe native authorization propagation, role-specific Canvas schema, bounded correction/read-only retry/write-outcome matrix, strict mandatory vs optional context | Complete browser tool-fault display matrix still unqualified |
| #160 | Prior 15 recovery cases plus full SPA six-case suite; persisted rejection race repaired | Repair PR must pass final CI/review and merge; full captcha login remains external |
| #161 | Durable independent terminal outbox, failed/cancelled preserved, dedup/fencing/revocation, five terminal browser cases with next turn | Controlled real provider and full deployment fault matrix remain unqualified |
| #163 | PR164 compact forum/real avatar acceptance already retained and merged | No new blocker identified |

No usable existing model-provider credentials or approved pricing configuration
were injected into this executor. No provider/credentials/permissions were
created. Production-image Worker sandbox preflight fails because this cloud
kernel does not allow the required user namespaces; no privileged/unconfined
bypass was attempted. A Web/API-only performance or duration sample cannot close
the full #153 Worker/dialogue/24-hour acceptance gate.
