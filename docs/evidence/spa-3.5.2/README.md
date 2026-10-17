# Published 3.5.2 full-SPA follow-up

The six post-login full-SPA recovery cases passed **6/6, zero failures/retries/skips**
on product `ba9014958f7ab0dc0636a18edd1339d9e9e76e60` and published
`@lyyzka/lingxios@3.5.2` / schema12. This closes the previously unverified **3.5.2
SPA session/human-message recovery** portion. It does not qualify captcha login,
live model answers, a complete sandboxed product Worker, or 3.5.2 durability.

The run uses the newly built actual React application, a separate local control
Worker and D1 session store, the signed gateway, separate PostgreSQL/Redis,
real pinned WuKongIM and separate storage. It does not use a component recovery
page or mock successful API responses. Synthetic post-login sessions use the
existing test secret; ordinary session validation and authorization stay active.

| Full SPA scenario | Observed result |
| --- | --- |
| Session restore/reload/expire/renew | Session200 →401 → restored; protected workspace hidden while expired |
| Network fails before acceptance | One original acceptance/message and one next acceptance/message; draft survives |
| Independent PostgreSQL container pause/unpause | Same one/one durable counts; draft survives; recovery without page refresh |
| Independent Web process stop/start | Same one/one durable counts; lifecycle records confirm real stop/start/readiness |
| Send rejected by expired session | Old send remains at zero acceptances/messages after renewal; next send succeeds once |
| Typing401 races the send response | Old send remains unsent after login renewal; next send succeeds once |

[Report](full-spa/report.json), [counts](full-spa/counts), [13 screenshots](full-spa/screenshots),
[6 videos](full-spa/video), [Web lifecycle](web-lifecycle.jsonl),
[build hashes](build-manifest.json) and [checks/log hashes](checks.json) retain
repeatable evidence. Screenshot names include the case hash so the two expired
session screenshots cannot overwrite each other. Request events/cookies/traces
and raw response bodies are omitted.

The runner captured the product commit while the prewritten isolated harness
was still uncommitted at startup. The unchanged executed harness is now commit
`ac7f9d4b2e5179de6c438ac8c5db9ae9b5d3fb15`; its dirty-start VCS fact remains in
the report. No product files changed between the qualified main and this run.
The SPA is freshly built from that product tree; its index and all asset hashes
are retained, rather than reusing the earlier3.5.1 build.

## Isolation and checks

The explicit `E2E_SPA_ISOLATED=1` profile has fixed disposable endpoints:
Web5280, API5281, runtime5282, supervisor5285, control8897, PG55433,
Redis56380, WuKong55002/55201 and storage59001. D1 uses
`.e2e/spa352-control-state`. The compose project is `lingxiloop-spa352`.
[Container identities/images/bindings](isolated-services.json) were captured.

The old helper would pause `lingxiloop-e2e-postgres-1`, which the original soak
uses. Two safety tests first failed; the new profile now verifies the exact new
container's label and loopback binding before pause/unpause, and rejects unknown
profile selections. Safety2/2, existing fixture safety3/3 and E2E typecheck passed.
The new compose services and API/control/preview processes were stopped after
qualification to release this executor's disk space. No original soak service
was stopped, paused, restarted, relabelled or reseeded.

## Complete Worker boundary: concrete failure

[The current preflight receipt](worker-preflight.json) binds public
`releaseVersions`3.5.2/schema12 and executes the same bubblewrap command required
by `server/src/agent-runtime/runtime.ts:startLingxiOSWorker`:

```sh
bwrap --die-with-parent --unshare-all --new-session --ro-bind / / \
  --proc /proc --dev /dev -- /usr/bin/true
```

It exited1 with **`bwrap: setting up uid map: Read-only file system`** on kernel
6.18.55. This cloud executor cannot satisfy the product's required production
Worker preflight. No privilege, namespace/sysctl, AppArmor, seccomp or production
configuration was changed. A complete product Worker was not started, and no
model call was made. This receipt is a host preflight, not a claimed immutable
3.5.2 Worker-image run. A second, disposable no-network container probe also failed with
`No permissions to create new namespace`. It used the already-cached base
image with the exact registry3.5.2 package mounted read-only, read only its public
version export, and ran the identical preflight under the image's default UID0
without additional privileges. The original soak container was not used. This
corroborates the container boundary without calling the mixed diagnostic image
an immutable3.5.2 release image. The upstream confined-image CI gate is separate
evidence.

The successful six SPA cases do not require generation: session validation,
signed API access, human-message acceptance, actual WuKong durability, draft
preservation and retry/session control can be tested independently. Full Worker
restart after an action, model-assisted complete-SPA conversations and live
provider behavior remain outside this executor's qualified results.

## Four-issue code review and acceptance mapping

Read-only review of product main `ba901495…` and upstream main
`e09fc03437804ec80bc2f6d6b3258dc3e2f35540` found **no additional product/runtime
code gap in the requested scope**. The follow-up changes only the acceptance
harness and evidence. This finding does not turn missing environmental or
long-duration evidence into a pass.

Reviewed ownership: product `server/src/agent-runtime/runtime.ts`,
`server/src/db/pool.ts`, shared `server/src/llm.ts`, native authorization,
terminal delivery, published model recovery/execution/embedding/fallback,
`src/model/child-admission.ts`, `PgModelBudgetStore.reserve/record`, terminal
schema/outbox/read APIs and background scheduling. The verified package uses
atomic root-budget locking, startup/closing holds, one-time usage settlement,
current authorization/request-version checks, stable terminal identity and
`suppressAgentWake`; failed/cancelled states are not rewritten as success.

Earlier evidence below is versioned explicitly. Upstream
[release39015169232](https://github.com/LingXi-Org/LingxiOS/actions/runs/39015169232)
and [publication39015407648](https://github.com/LingXi-Org/LingxiOS/actions/runs/39015407648)
qualified3.5.2 with422/422; product
[main39016358468](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39016358468)
passed245 integration checks with21 prerequisite skips. The
[3.5.2 development evidence](../runtime-development/README.md) records the11/11
runtime browser fixture cases,17 owning integration passes and20/20 dedicated
real-WuKong checks. Those11 cases use a synthetic model and fixture login and
are not relabelled as complete-SPA/model-provider execution.

| Issue / original acceptance item | Concrete coverage | Remaining condition, not a new code fix |
| --- | --- | --- |
| #153.1 idle/load/profile/24h | Published scheduler tests cover bounded background connections, cancellation, coalesced notifications, backoff, passive roles and periodic recovery. Prior paired image measurement is3.5.1 Web/API-only. | Qualified Worker/model-dialogue load and retained-heap measurement need an authorized suitable executor/provider; complete24h duration is still outstanding. There is no3.5.2 endurance result. |
| #153.2 Web/Worker/DB fault E2E | This3.5.2 full SPA passes real independent Web stop/start and PG pause/unpause with durable-count and continuation assertions. | Complete sandboxed product Worker restart remains blocked by the recorded preflight. |
| #153.3 health/operations | Readiness/liveness, pool/timeouts and gateway retry boundaries reviewed; owning tests remain qualified by the3.5.2 product CI. | Komodo entry repair, deployment/update-state and production rollout were explicitly removed by the user; they are not development blockers or implied passes. |
| #155.1 provider fault matrix/bounds/ledger | Exact3.5.2 upstream422 gate covers classification, recovery/circuits, cancellation and metadata. Product timeout/total-deadline integration proves bounded requests, disconnection, settled usage, one terminal notice and successful next turn. | Controlled real-provider behavior requires existing authorized endpoint/model/key, prices and explicit spend/call limits. |
| #155.2 fallback/embedding | Upstream fallback tests require current authorization, compatible capability and matching price; no attempt reset. Embedding quota/auth circuits preserve vector-space identity. | No approved live secondary route/provider is configured; none was created or enabled. |
| #155.3 runtime+browser+real provider |3.5.2 product owning tests and11-case runtime fixture passed; this follow-up adds6 complete-SPA session/send cases. | Actual provider-assisted full-SPA conversation is not claimed; external provider configuration and qualified Worker are still required. |
| #157.1 token/cost/deadline/concurrent admission | Atomic budget/closing holds, pending-fanout bound, rollback and settled near-limit cost/idempotency tests pass in3.5.2. | Controlled settlement uses deterministic usage/prices, not an actual supplier bill; live near-cost-limit acceptance remains external. |
| #157.2 one root notification/results preserved | Runtime browser fanout fixture rejects two starts, creates zero child tasks, preserves the successful root answer and emits one aggregate notice without Agent wake. | No additional code blocker found; do not infer live billing from this fixture. |
| #157.3 group mentions/new human turn | Existing group-mention integration and3.5.2 runtime browser continuation pass with no active runs afterwards. | Real multi-agent provider run needs the same provider/pricing/Worker prerequisites above. |
| #161.1 fault matrix and durable replay |3.5.2 package/product tests cover budget/context/provider/authorization/recovery/fencing;20 real-WuKong cases retain one send/message, same result identity and unchanged action/model ledger. This SPA adds actual reconnect/session/Web/DB recovery. | Full product Worker crash-after-action and controlled real-provider matrix require a suitable authorized cloud executor. |
| #161.2 partial/blocked/cancel/revocation | Terminal feedback remains separate from results; request/fence/audience checks and revoked-delivery tests pass. Runtime browser cancellation has no extra model call and permits the next request. | No additional code gap found in this review. |
| #161.3 historical regressions | Package lease-recovery bounds and inherited evidence, product receipt reconciliation/FK regression remain covered; no old defect is reported as newly reproduced. | No additional issue-specific code gap found. |
| #161.4 public API+browser+provider | Exact public3.5.2 package, product CI, runtime fixture11/11 and this complete-SPA6/6 have retained artifacts. | Real provider and complete Worker isolation remain unqualified; captcha/login itself is also excluded from these post-login tests. |

[Provider prerequisites](provider-prerequisites.json) records presence checks
only: none of the required provider/model/key/input/output-price environment
variables was supplied. No values, secrets or prompts were exported. Open
issues153/155/157/161 therefore retain **external configuration/environment and
observation-window acceptance conditions**, not an identified unimplemented
product repair. The3.5.2 durability exercise is unperformed, not silently passed.

## Existing soak and independent follow-up

[Isolation receipt](soak-isolation.json) confirms the original image start time,
restart count0, unpaused state, unchanged observation start and zero violations
after this suite. That observation remains **3.5.1 Web/API-only**, started
2026-10-17T06:42:47.900Z, earliest completion2026-10-18T06:42:47.901Z.
It cannot qualify3.5.2, model dialogue or a production Worker.

Monitor285092 writes state/heartbeats/terminal receipt. Evidence watcher363050
pushes initial/hourly/final snapshots to
[codex/runtime-soak-evidence](https://github.com/LingXi-Org/LingxiLoop/tree/codex/runtime-soak-evidence/docs/evidence/runtime-measurements/soak)
and reports terminal/stale failures. A separate existing ChatGPT Automation,
**LingxiLoop soak 复查**, is enabled for **2026-10-18 06:50UTC**, with exact one-time
schedule `DTSTART;TZID=Etc/UTC:20261018T065000`. It reads public remote state,
handoff, heartbeats and terminal receipt independently of the shell watcher.
The existing task identifier was verified and reported privately to the parent;
no second task was created. Its schedule/enabled flag are saved; execution or
notification delivery has not yet occurred. Missing/stale evidence or an absent
terminal receipt must be reported incomplete. It performs no production action.

## Reproduce

Use Node22, the exact published dependency and existing synthetic test-service
images (override `E2E_WUKONG_IMAGE`/`E2E_STORAGE_IMAGE` only with the matching
already-authorized images). No developer/provider dotenv is loaded in this run.

```sh
docker compose -f e2e/acceptance/compose.yaml up -d --wait
E2E_SPA_ISOLATED=1 node e2e/local-api.mjs --seed-only
E2E_SPA_ISOLATED=1 node e2e/admin/start-control.mjs
# In another terminal:
E2E_SPA_ISOLATED=1 ACCEPTANCE_FIXTURE_ROOT="$PWD" node scripts/runtime-acceptance/spa-web-supervisor.mjs
# Build, then preview (another terminal):
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:8897 LINGXILOOP_DEV_WS_TARGET=ws://127.0.0.1:5281 \
node node_modules/vite/bin/vite.js build --outDir .e2e/spa352-dist
LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:8897 LINGXILOOP_DEV_WS_TARGET=ws://127.0.0.1:5281 \
node node_modules/vite/bin/vite.js preview --outDir .e2e/spa352-dist --host 127.0.0.1 --port 5280 --strictPort
# Official engine:
E2E_SPA_ISOLATED=1 ACCEPTANCE_FIXTURE_ROOT="$PWD" E2E_BASE_URL=http://127.0.0.1:5280 \
E2E_BUILD_INDEX=.e2e/spa352-dist/index.html PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
npm run test:e2e:web -- --config e2e.acceptance.config.ts --output .e2e/full-spa-acceptance --video on
node --test e2e/acceptance/isolation-safety.test.mjs e2e/server/fixture-safety.test.mjs
npm run test:e2e:typecheck
```

Stop only the new profile's API/control/preview processes, then run
`docker compose -f e2e/acceptance/compose.yaml down`. Never stop the original
soak project or use a shared PostgreSQL pause for this selection. The scoped
repository CI may skip product suites for harness/docs-only changes; the cloud
commands and retained results above are the actual owning checks, not a claim
that skipped CI jobs executed the browser suite.
