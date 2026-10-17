# #153 product foundation package

Base: `2db5bbcddc8f14ac62500e36594dc49793c9e096`. This package does not close #153.

## Boundaries

`/api/livez` is process liveness. Existing `/api/health` retains PG/Redis semantics; it already checked both at baseline. `/api/readyz` adds required LingxiOS control readiness. `/api/health/dependencies` remains a diagnostic that can fail for optional Notebook; it is not a restart/traffic gate. Responses are `no-store` and contain no internal error strings. The control public `/readyz` contract was read from upstream tag v3.4.7 `src/control-plane/http-server.ts`: 200 plus `{ok:true}`, with its own 2-second readiness budget. The product client aborts at 2.5 seconds; product readiness bounds PG/Redis at 1 second and control at 3 seconds. Compose fetches abort at 4 seconds inside the existing 5-second Docker probe limit.

Both app compose files propose readiness probes only; resource limits, pool size, image pins, security settings, credentials and production state are unchanged. Gateway `/healthz` stays local liveness; new `/readyz` checks the API required path with existing safe GET failover. Existing API/POST retry policy is unchanged; no `non_idempotent` retry flag is enabled. Gateway readiness is a passive probe, not active per-backend health routing. Actual traffic failover and business idempotency require Astra's full product/browser validation.

The pool adds acquisition outcomes/latency histogram and SQL **submission** count for pool and checked-out clients, preserving pg Promise/callback APIs. SQL count includes failed queries and transaction commands; it is not a completed-work or conversation count. Pool active includes long-lived listeners. Process series include heap/limit/RSS/external/ArrayBuffer bytes, CPU, uptime, GC and event-loop delay/utilization. GC and delay mean/max are process-lifetime observations, not interval quantiles. All new series have fixed labels and contain no SQL text, tenant IDs, connection URLs or error messages. Existing metrics token behavior is unchanged.

## Reproduce foundation regression

First synchronize the exact root lock with authorized package access. Do not use the preinstalled LingxiOS 3.3.8:

```sh
npm ci --cache /tmp/s153p-npm-cache --prefer-offline --no-audit --no-fund
node -p "require('./node_modules/@lyyzka/lingxios/package.json').version"
docker compose -f e2e/server/compose.yaml up -d --wait
node scripts/issue-153/run.mjs
node scripts/issue-153/config-check.mjs
npm run server:lint
npm run server:typecheck
npm run server:test
```

`run.mjs` constructs a synthetic environment, ignores dotenv and refuses the default run unless installed LingxiOS is 3.4.7. For explicitly limited diagnostic work, `--foundation-only` permits testing modules that do not import LingxiOS, and records `frozenDependencies:false` in the receipt. It is not a substitute for the frozen product gates. Real PG and Redis are required at the repository's disposable E2E ports. The test uses only SELECT and synthetic local control responses; it does not migrate/reset data or invoke a provider. All servers/connections close naturally without force-exit.

Failure model was written before production edits in `FAILURE-MODEL.txt`. The HTTP suite covers PG starvation and recovery, Redis disconnect and recovery, required/optional separation, sanitized failures, concurrent/late probe reuse, Promise/callback pg behavior, failed SQL and both acquisition timeout APIs. It also exercises the bounded sampler in three phases. Final results and dependency limitations: `VALIDATION.md`. Artifacts: `evidence/regression.json` and `evidence/foundation-{idle,normal,burst}.json`.

## Reproducible isolated image sampling

Use an explicitly disposable deployment, never a production-forwarded loopback port. Both before/after images must have immutable digests, the same exact LingxiOS version (3.4.7 for this baseline), database fixture/snapshot, configuration, pool budget, machine and container limits. The sampler does not start images, inject secrets or change configuration. Start each isolated image via the existing approved image harness, bind its Web/API only to a loopback port, and record its actual digest and CPU/memory/heap/pool limits. There is no verified same-production-image harness in this package; Astra must supply runtime/provider/storage initialization and controlled dialogue load.

```sh
# Token comes from the disposable instance's environment, never the command line.
export S153P_ISOLATED=1
# Set METRICS_BEARER_TOKEN to the isolated instance token using the environment.
node scripts/issue-153/sample.mjs --base http://127.0.0.1:5181 --phase idle --seconds 300 --image '<immutable image digest>' --limits '<cpu/memory/heap/pool>' --out /tmp/s153p-idle.json
node scripts/issue-153/sample.mjs --base http://127.0.0.1:5181 --phase normal --seconds 300 --concurrency 1 --path /api/livez --image '<immutable image digest>' --limits '<same limits>' --out /tmp/s153p-normal.json
node scripts/issue-153/sample.mjs --base http://127.0.0.1:5181 --phase burst --seconds 300 --concurrency 16 --path /api/livez --image '<immutable image digest>' --limits '<same limits>' --out /tmp/s153p-burst.json
node scripts/issue-153/sample.mjs --base http://127.0.0.1:5181 --phase soak --seconds 86400 --concurrency 1 --image '<immutable image digest>' --limits '<same limits>' --out /tmp/s153p-soak.json
```

These commands measure safe GET latency only; normal/burst labels identify sampler concurrency, **not normal dialogues**. Run the official product dialogue/fault workload in parallel for actual acceptance and retain its durable receipts, P95/P99 and queue oldest-age series. Run A/B alternating at least ten times under the same workload before claiming a performance improvement. Baseline lacks the new infrastructure series; the sampler rejects empty metric scrapes instead of inventing zero values. Instrument the baseline equivalently or collect a separate external profile before comparing SQL/heap curves.

The sampler refuses non-loopback URLs and redirects, bounds concurrency (64), duration (24h), request deadlines and retained memory (10,000 metric samples and a 100,000-request latency reservoir; long-run percentiles are approximate), writes only allowlisted infrastructure metrics, records machine/source/config identities and produces request percentiles. Cumulative SQL/acquire/GC/CPU deltas divided by sample interval give rates; RSS/heap/pool are gauges. It fails on request or metrics errors. Profiles can contain sensitive state: collect protected allocation/heap/GC profiles in the disposable image, review/redact them before sharing; this sampler does not upload snapshots.

## Acceptance and rollback

No resource increase is proposed without measurements. Keep current resource/pool values until retained-heap profiles and total Web/Worker/listener/migration/ops connection budgets are known. Suggested integration gates: readiness drops on each required dependency fault and recovers after restoration; liveness remains 200; no duplicate durable write through failover; no sustained acquire timeout or growing queue age; no V8 OOM/unexpected restart across the full 24h run. Numerical latency/resource thresholds must be set from paired full-product measurements, not this short SQL fixture.

For a later authorized canary, change one instance first, observe those gates, then the second. Roll back to the prior immutable image and prior probe paths (`/api/health` for Web; existing worker `/readyz`), and remove the gateway `/readyz` location if required. This is a future runbook only: no deployment, production configuration change or merge was performed.

Remaining #153 work: upstream idle/maintenance ownership and backoff, runtime/LLM/queue metrics, retained-heap profiles, real same-image dialogue baselines, 24h soak, single-Web/Worker/DB-fault browser recordings via tester-army/e2e + official @e2e-dev/web, real provider and WuKong delivery, Komodo CLI/API/update-state recovery and production canary/rollback acceptance. Astra owns integration; no change here closes the issue.
