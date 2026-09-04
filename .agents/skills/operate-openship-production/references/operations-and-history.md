# Operations, recovery, and deployment history

## Architecture decision record

The original single-host production Compose put PostgreSQL, Redis, WuKongIM, Open Notebook, SurrealDB, Web, Worker, and AgentOS in one failure domain. The first two-server OpenShip layout separated state and business services but left AgentOS single-active on Server B with one run slot, 1 CPU, and 768 MB; Server B sat near the 4 GB limit.

The implemented design is the smallest two-node execution plane:

- A: state services, API-A, AgentOS-A.
- B: only public ingress, API-B, Worker, Gateway, knowledge services, AgentOS-B, and later LingxiLit.
- One API and one AgentOS per physical host.
- PostgreSQL/Redis/WuKongIM remain authoritative on A; no unsafe two-node election.
- The public platform remains unavailable if B/Edge fails, and full business behavior can fail if A/state fails.

Do not describe this as whole-SaaS automatic HA. It provides API process/host redundancy behind one ingress and AgentOS capacity/process/host redundancy around one state host.

## AgentOS execution contract

Implemented and pushed in commit `9d5249e`:

- Migration `0003_agent_os_session_affinity.sql` adds `agent_os_workers` and `agent_os_session_routes` without modifying the baseline migration.
- Existing sessions were backfilled from their most recent `leased_by` to preserve the former Server B Home affinity.
- Idle poll heartbeats and busy work heartbeats update worker liveness.
- An unassigned session is atomically claimed by the first node with a free local slot.
- A session owned by a healthy node can only be claimed by that node.
- After `AGENT_OS_NODE_TIMEOUT_SECONDS=15`, another node may adopt queued work and increment `homeEpoch`.
- `FOR UPDATE SKIP LOCKED`, the 45-second work/session lease, and fences prevent double execution and stale commits.
- Each node starts with `AGENT_OS_MAX_CONCURRENT_RUNS=1`; full local slots naturally stop polling, so no centralized active-run counter or Redis router is needed.
- `AgentWorkItem.homeEpoch` isolates takeover Home state. Epoch 1 uses the historical path; later epochs use a new generation path, so old process variables/files do not leak into the adopted session.
- SIGTERM stops new claims and drains active work within the configured grace. A hard-killed job retains its lease and is reclaimed only after expiration; it is not misreported as a user cancellation.
- Final stream validation reads only events from the current fence, preventing old partial output from being appended to a retry.
- Retries reuse `run_id`, Host Action idempotency keys, persistent session state, LLM ledger, authorization, and audit contracts.

There is no inbound API-to-AgentOS URL. `AGENT_OS_URL`, `AGENT_OS_ENDPOINTS`, Redis run routing, and Agno Gateway are explicitly out of scope.

Release order for AgentOS changes:

1. Run database migration.
2. Roll API-A/API-B and verify readiness against the shared heartbeat table.
3. Confirm the existing `agent-os-b` heartbeat.
4. Start AgentOS-A.
5. Wait for old AgentOS-B `activeRuns=0`, stop it, and start the independent AgentOS-B project with the same worker ID and selected volume.
6. Verify both heartbeats and fence behavior.
7. Keep only Server B Worker enabled.

## Compose project split

- `knowledge-agent.yml` now contains only SurrealDB and Open Notebook.
- `agent-os.yml` is an independently deployable one-service project with required `AGENT_OS_VOLUME_NAME`, no host-published 5190, 1 CPU, 768 MB, and 30-second container stop grace.
- `app-a.yml` contains only migration and Web; `app-b.yml` contains migration, Web, Worker, and Gateway. Production uses no Compose profiles.
- Production contains no WuKongIM demo. Do not add a deletion action for a container that does not exist.

The historical service `svc_U9hxlXJ1nchRbzmk` was the AgentOS embedded in `lingxiloop-knowledge-agent`, published on host 5190 and running image `868bcbde...`. It was removed when the two independent AgentOS projects were created.

## Image publication and synchronization

CI builds only affected LingxiLoop images on linux/amd64 and pushes immutable full-commit tags. A `VERSION` release builds all five. `scripts/update-deployment-images.mjs` covers:

- `deploy/openship/app-a.yml`: server;
- `deploy/openship/app-b.yml`: server, Gateway;
- `deploy/openship/agent-os.yml`: AgentOS;
- `deploy/openship/core-state.yml`: WuKongIM;
- `deploy/openship/knowledge-agent.yml`: Open Notebook.

The current active LingxiLoop release uses manifest commit `7038ba612bb3331d1f65e9282b153436b29b9396`. Manual full-release workflow `33754222925` rebuilt Server, AgentOS, WuKongIM, Open Notebook, and Gateway with immutable tag `7f16f69be731326e091cc703c850e6b7ee6af6a5`. The signed release requires all five image references to be present and immutable but does not force unrelated components to share one tag. All six projects run the same manifest.

- `9fe3cc645e2998c6201c737d4e4e2db2699cd423`: Gateway health check uses IPv4.
- `e409455157529a2cfe2d1bf4cfefd0cfb6fe4f29`: first immutable Gateway image; retained as an unused B image.
- `ed4d749ce9be62cfd20895b39ac6f5c45c410ecc`: previous server/AgentOS/Open Notebook/WuKongIM generation.
- `868bcbde28e59a817f12de050ee40d65dd43313b`: older knowledge/AgentOS generation.
- `e96274a2a6edbbea9ea113ad38dc7be3397bf8fc`, `80fc99743172e55fd56813cbbbab6c6890a2f19c`, `4b6b77b0aa36a67e61b92dcaefea0fc300093ea0`, `a7515981a1980d812f4839845de31d36c79a56b8`, and `c692ff56ee69b50ea1c9320b920c17595562f9be` were observed during intermediate releases.

Complete image-tag inventory observed in the session, retained only for archaeology:

- AgentOS: `53572c0e...`, `80fc9974...`, `868bcbde...`, `c692ff56...`, `e96274a2...`, `ed4d749c...`, and legacy `mvp`.
- Gateway: `53572c0e...`, `5a33ec9a...`, `a7515981...`, `c692ff56...`, `e4094551...`, `e9d82fc7...`.
- Open Notebook: `53572c0e...`, `80fc9974...`, `868bcbde...`, `c692ff56...`, `e96274a2...`, `ed4d749c...`, and legacy `mvp`.
- Server: `4b6b77b0...`, `53572c0e...`, `80fc9974...`, `868bcbde...`, `a7515981...`, `c692ff56...`, `cf5ca90b...`, `e4094551...`, `e96274a2...`, `ed4d749c...`, and legacy `mvp`.
- WuKongIM: `4b6b77b0...`, `53572c0e...`, `80fc9974...`, `868bcbde...`, `c692ff56...`, `e96274a2...`, `ed4d749c...`, and legacy `mvp`.
- LingxiLit: `sha-f3017e23cc0a31753b022c64eb40a837f463d627`.
- Infrastructure/third party: ClickHouse `24.4.1`, Edge `0.6.9`, SurrealDB v2 pinned digest `d653f6c8...`, `pgvector/pgvector:pg16`, and `redis:7-alpine`.

All LingxiLoop images above used the `accel.way2api.fun/ghcr.io/lyyzka/` mirror in production. Historical text also mentioned direct/dev images `ghcr.io/lyyzka/lingxiloop-wukongim:mvp`, `ghcr.io/lingxi-org/lingxiloop-server:dev`, `ghcr.io/astral-sh/uv:latest`, and `docker.io/library/nginx:alpine`; they are not current production services.

The 53572 slimming changed the server image from roughly 955 MB/older 1.62 GB storage representation to 613 MB, AgentOS to 706 MB, and Open Notebook to 490 MB. Before slimming, AgentOS/root dependencies included roughly 1.03 GB of `node_modules` and a 153 MB npm cache; very large UI/icon/telemetry/PDF packages were accidentally present. The user handled code-level slimming. Operations should only flag renewed growth, not redesign the application image without a code request.

OpenShip sometimes kept a previous service image even after a project refresh. In one release, API-A remained on `ed4...` until its service row image was explicitly updated and refreshed. The 2026-09-03 reset reconciled every row, but operators must still inspect running images after every deployment.

## Signed CI-to-OpenShip release path

All six LingxiLoop projects have GitHub-push `autoDeploy=false`. After CI succeeds, it promotes the exact control-plane Worker Version and sends an HMAC-signed payload containing the source commit, manifest commit, and complete independently pinned immutable image set to `https://admin.lingxilearn.cn/api/internal/releases`. The Worker validates the signature and payload, synchronizes all ten image-bearing service rows, records the request idempotently in D1, and fans it out to the six checked-in project IDs.

OpenShip's Dashboard proxy is `/api/proxy/api/*`; calling `/api/*` on `ops.christmas1314.xyz` returns `404`. Deployment creation normally returns `202 Accepted` without an ID, so the Worker treats every 2xx as accepted and later OpenShip/health checks establish completion. The first production run revealed both assumptions; fixes `932e14f` and `0f1e4aa` corrected them. Synchronize `RELEASE_HMAC_SECRET` between GitHub's `production` environment and the Worker without reading it back. On Windows, prefer Wrangler secret bulk JSON and allow edge propagation before testing because line-oriented stdin can append a newline.

## Server B resource incident and cleanup

Before cleanup:

- root disk reached 97% (39/40 GB, about 1.3 GB free);
- `/var/lib/docker/overlay2` occupied about 27.2 GB across roughly 560 directories;
- volumes were only about 295 MB and logs below 2 MB;
- layer metadata showed 147 cached layers while three current images needed only 33;
- around 12 GB was unreferenced historical image data, including a 1.35 GB Logto dependency layer and two roughly 1.29 GB Chromium layers;
- `/www` from Baota occupied about 3 GB, `/root` about 600 MB, and logs about 265 MB;
- a failed large image pull pushed `dockerd` to about 3.1 GB RSS;
- `docker system df -v` triggered a roughly 3.38 GB metadata scan and loss of SSH responsiveness.

Safe pruning first reclaimed about 11.7 GB on B and 5 GB on A while preserving volumes. The user then authorized downtime and destructive cleanup because there was no production data:

- fully removed Baota/BT `/www`, HIDS, statistics, Fail2Ban remnants, cron entries, services, and the `www` user;
- removed old Chainlit, Geektime, Mihomo, Stirling PDF, and Clash Panel directories;
- removed rootless Docker and six unused dependencies;
- cleared DNF, BuildKit, stale images, logs, and caches;
- rebuilt Docker storage, deleting about 12 GB of old layers, 39 nonproduction/no-data volumes, old containers, and build cache;
- upgraded B from Docker 28.0.1 `overlay2` to Docker 29.7.2 containerd image store `overlayfs`;
- A now runs Docker 29.3.1 `overlayfs`.

Immediately after cleanup, B used about 28% of disk with roughly 29 GB free. After the complete production deployment it stabilized around 35% with 27 GB free. Do not repeat destructive cleanup unless current inspection identifies the exact recoverable targets and the user authorizes downtime/data loss.

Prefer targeted checks and ordinary `docker image prune`/builder cleanup. Never use broad recursive deletion against unresolved paths. Do not run `docker system df -v` on B under load.

## SurrealDB destructive rebuild

The original SurrealDB failed because RocksDB could not write the `surreal-data-v2:/data` mount. With explicit no-production-data authorization:

- the old container was stopped;
- both old `surreal-data` and `surreal-data-v2` volumes were deleted;
- a fresh named `surreal-data` volume was created;
- the data path moved to `/home/nonroot`, and the database is `rocksdb:/home/nonroot/open-notebook.db` in the intended manifest.

Current production uses `openship-lingxiloop-knowledge-agent-surreal-data:/home/nonroot`. The Surreal image also creates anonymous `/data` and `/logs` volumes; they are image-declared mounts, not the authoritative RocksDB Home. Never resurrect `data-v2`.

Named-volume inventory learned during the session:

- current A: `openship-lingxiloop-core-state-postgres-data`, `openship-lingxiloop-core-state-redis-data`, `openship-lingxiloop-core-state-wukong-data`, `openship-lingxiloop-agent-os-a-agent-os-data`;
- current B: `openship-lingxiloop-knowledge-agent-surreal-data`, `openship-lingxiloop-knowledge-agent-open-notebook-data`, `openship-lingxiloop-agent-os-b-agent-os-data`, `openship-lingxilit-shanghai-b-clickhouse-data`, `openship-lingxilit-shanghai-b-openlit-data`;
- historical/obsolete: `openship-lingxiloop-knowledge-agent-agent-os-data`, `openship-lingxiloop-surreal-data`, `openship-openlit-clickhouse-data`, and the deleted Surreal `data-v2` generation.

The 2026-09-03 first-release reset recreated only the current Open Notebook and SurrealDB containers and deleted only `openship-lingxiloop-knowledge-agent-open-notebook-data` and `openship-lingxiloop-knowledge-agent-surreal-data`. This was explicitly authorized because production had no data; no backup exists for that discarded state. The deployment recreated both volumes, Open Notebook passed readiness against the stable `loop` endpoint, and SurrealDB now receives `SURREAL_USER`/`SURREAL_PASS` through the environment with no password in command metadata.

## 2026-09-03 first-release drift reset

- Manifest `f02ce00...` made fixed production private binds explicit because OpenShip's upstream-accept path did not expand bind variables. Obsolete project-level `PRIVATE_BIND_IP` values were removed from Core and Knowledge.
- Gateway health now targets `127.0.0.1`; WuKongIM publishes 5001/5200 only on `10.20.0.2`; Open Notebook publishes 5055 only on `10.20.0.3`.
- App A keeps one explicit resolved service bind, `10.20.0.2:5181`, to avoid the same parser limitation. This is synchronized local metadata, not active drift.
- Open Notebook moved from retired `origin-a` to `https://loop.lingxilearn.cn/internal/open-notebook/v1`; the required empty Knowledge reset is recorded above.
- API-A and API-B were each stopped in turn. The Gateway stayed healthy through the other API, then both nodes were restored.
- Server A keeps the OpenShip-managed Edge, while enabled unit `lingxiloop-private-ingress.service` rejects public-interface 80/443 and preserves WireGuard traffic. Server B remains the only public ingress.
- Final checks: 16/16 healthy, zero OpenShip issues, zero drift, both AgentOS heartbeats fresh, queue empty, public/private HTTP and WuKongIM WebSocket probes successful.
- Commit `5d8215c...` removed the old production/Dokploy/manual deployment files, split App A/B manifests, deleted App A's stale Worker/Gateway rows, and restricted admin topology/deployment feeds and Uptime to the current production set.
- Commit `ad9a7f2...` replaced same-tag cohort selection with complete per-component pins. Workflow `33711770224` rolled all six projects to `ready`, advanced only Gateway to `3b0069a...`, and public auth changed from 404 to JSON HTTP 200.
- Commit `303cedb...` added a main-only manual `scope=release` path that rebuilds all five images before the usual six-project rollout. Commit `99f2e43...` changed the release idempotency key from the source commit to the generated manifest-pin commit; otherwise a second image batch built from the same source commit could be reported successful without creating new OpenShip deployments.
- Workflow `33715749321` exercised the corrected path end to end: five `99f2e43...` images, manifest commit `df724bc...`, six new ready deployments, and synchronized OpenShip version 2.
- OpenShip dashboard `vN` labels are per-project ready-deployment ordinals, not image tags or a shared release number. With explicit authorization to remove debugging history, the six project histories were normalized offline after a 57 MB PGlite backup at `/root/.openship/backups/20260903T1230-openship-pglite`; the current release then advanced all six from version 1 to version 2. Do not repeat this destructive metadata cleanup without a fresh backup and explicit scope.

## LingxiLit first deployment

AI observability is the separate `lyyzka/LingxiLit` repository, not a LingxiLoop service. Project `lingxilit-shanghai-b` was created on B with:

- ClickHouse `accel.way2api.fun/docker.io/clickhouse/clickhouse-server:24.4.1`, 0.75 CPU, 640 MB;
- OpenLit `accel.way2api.fun/ghcr.io/lyyzka/lingxilit:sha-f3017e23cc0a31753b022c64eb40a837f463d627`, 0.75 CPU, 512 MB;
- `clickhouse-data:/var/lib/clickhouse` and `openlit-data:/app/client/data`;
- private OTLP 4317/4318, no public ClickHouse ports, OpenLit through Edge only.

Host assets live in `/var/lib/openship/openlit/assets/`. The first ClickHouse start exited 126 because `clickhouse-init.sh` had CRLF (`/bin/bash^M`). The runtime asset was converted to LF and ClickHouse restarted. Ensure the source/installed script stays LF or a future replacement can reintroduce the failure.

The first OpenLit migration logged `UNKNOWN_TABLE` while attempting ALTERs on `openlit_agents_summary`, but later migration steps created the required database/tables and the app became healthy. Treat repeat occurrences as a migration-order signal, then verify final ClickHouse tables rather than failing solely on those early log lines.

OpenLit and ClickHouse are now deployed alongside AgentOS-B. Earlier planning considered them mutually exclusive because only about 1.2 GB was free; post-slimming and host cleanup increased headroom enough for the observed steady state. Recheck memory before increasing AgentOS concurrency.

## Public ingress cutover history

The application originally used `origin-a`, `origin-b`, direct Server A IM, and a Cloudflare Worker custom domain for `admin`. The final target is one备案 public IP on B:

- the Gateway was added to App B;
- `loop` was moved from API-B:5181 to Gateway:8080;
- apex/`www` use the Gateway website;
- IM is relayed from B to A through WireGuard;
- `admin` moved to Workers.dev;
- OpenShip management moved to `ops.christmas1314.xyz`.

The owner later restored `admin.lingxilearn.cn` as the primary Cloudflare Worker Custom Domain. Wrangler now declares it explicitly, `AUTH_ALLOWED_HOSTS` includes it, and `workers_dev=false` disables the Workers.dev route. Uptime monitors the custom domain because mainland DNS poisoned the former Workers.dev hostname and caused false outages.

OpenShip's one-domain-per-service behavior originally required persistent host Edge alias files for apex, `www`, and IM. Apex and `www` moved to the dedicated static project on 2026-09-04; only IM still uses a host alias. The old route IDs and DNS records are documented in the network reference.

## Landing static-site cutover

On 2026-09-04, OpenShip project `proj_zLjrHA6Bb8KurSS_` deployed `lyyzka/lingxiloop-landing-page` commit `d1b98ab2cfe6f3e2277430d8a32c808c2005ff69` as static release `dep_5QEIBHtbiE16mLlU` on Server B. Domain objects `dom_fyVApndXtudWStuk` and `dom_7lNpif0xxYg3GHnV` own apex and `www`; both are verified with active OpenShip-managed certificates, and `www` redirects to apex.

The first domain cutover still showed the old Gateway website because `/var/lib/openship/edge/sites-enabled/00-gateway-aliases.conf` duplicated both server names and loaded before OpenShip's generated static routes. Operations moved that file to `/var/lib/openship/edge/sites-disabled/00-gateway-aliases.conf.disabled-20260904T074537Z`, passed `openresty -t`, and reloaded Edge. Public apex then returned the static release byte-for-byte (SHA-256 `c4eef61418d8ec060e38964a1614f1664947ebbcf2ab5ff6bee1cd975265ff7d`) with HTTP 200 and title `LingxiLoop – 智能学习工作区`; `www` returned 301 to apex and `loop` health remained 200.

## Login session routing repair

On 2026-09-03, repeated browser sign-ins created valid D1 session rows but the app returned to its login screen. The Gateway sent only `/api/auth/` to the control-plane Worker, so the immediate `/api/session` bootstrap request bypassed authentication, reached Express, and returned 404; `AuthGate` then cleared its local state. PR `#17` changed the Gateway to send all unsigned browser `/api/` traffic through the Worker and route requests carrying the Worker's signed gateway assertion directly to the dual API upstream. The server remains responsible for validating that assertion, so merely supplying the header does not bypass authentication.

CI/CD run `33725928050` published Gateway tag `d794d15db8cd011ca9c776686a09e17aa66fb628`; generated manifest `9ec63f0...` reached `ready` on all six projects at OpenShip version 3. The running Gateway was healthy, anonymous `/api/session` changed from Express 404 to authentication-layer 401 JSON, `/api/auth/get-session` remained 200, and the Worker's signed `/api/health` origin request returned 200. OpenShip reported 16/16 healthy workloads with no outage or action-required issue; six advisory-only source comparisons still referenced the historical `df724bc...` manifest.

## Personal workspace participant repair

On 2026-09-03, newly registered personal users could not create courses because registration created the user, personal company, memberships, and default project but omitted the owner's human `participants` row. Course creation then failed the `domain_events_actor_company_fkey` constraint when recording the user actor. Commit `e6025ad...` made personal-workspace provisioning idempotently upsert that participant in the registration transaction; migration 4 repaired existing active personal owners.

CI/CD run `33734932192` passed its required gates, published Server and AgentOS tag `e6025ad...`, and generated manifest `d934324...`. All six OpenShip deployments reached `ready` at version 4. Both migration one-shots exited 0, the production gap query returned zero missing participants, API-A/API-B and both AgentOS containers ran the new images healthy, and public `/api/health` returned 200. Server B's image pulls took about eight minutes but completed without intervention or data loss.

## Durable chat reply reconciliation repair

On 2026-09-03, a user message was accepted, AgentOS and its LLM ledger completed successfully, and WuKongIM durably stored the final agent reply, but the browser showed no output. The frontend treated the transient stream preview as mandatory and rejected the authoritative durable reply whenever login, reconnect, or a stream gap caused that preview to be missed. Commit `c9324ff...` removed only that client-side preview dependency while retaining normal run reconciliation; server-side final-message validation remains authoritative.

CI/CD run `33739088290` passed the required checks, published Server tag `c9324ff...`, and generated manifest `1c708cf...`. All six OpenShip deployments reached `ready` at version 5. API-A, API-B, and Worker-B run the new Server image; public `/api/health` returned 200 and the health watcher reported 16/16 healthy workloads with zero outage and zero action-required issues.

## Native tool and question-card prompt contract

On 2026-09-03, production evidence showed a vague but explicit planning request could receive a plain-text diagnostic question because the prompt contract allowed diagnostic questions as text. Commit `bae7c72...` changed the shared AgentOS contract to require `loop.chat.ask` for every blocking question and require the matching native Host action for explicit product operations; `prompt-v5` and the runtime Eval case make that behavior observable and regression-tested.

A concurrent documentation push cancelled the first CI run after its required server checks and runtime Eval passed. The official main-only manual full-release workflow `33754222925` then rebuilt all five images from source `7f16f69...`, generated manifest `7038ba6...`, and fanned out six version-7 deployments. All reached `ready`; both AgentOS containers run the new image, the live container exposes `prompt-v5`, both migration one-shots exited 0, the health watcher reported 16/16 healthy workloads, and public `/api/health` returned 200.

## Alibaba Mail OTP cutover

On 2026-09-03, Better Auth OTP and password-reset delivery moved from the control-plane Worker's Resend HTTP call to Alibaba Mail TLS SMTP on port 465. Passwords are supplied only by Worker secrets, and the previous Worker Resend secrets were removed after both mailbox authentication and a no-reply-to-support delivery were verified. App A/B continue to use their separate Resend configuration for agent email. Wrangler on the C-drive worktree repeatedly discovered an unrelated ancestor Yarn PnP manifest; the successful deployment used an isolated D-drive directory with physical temporary dependencies, as the standard junction still resolved back beneath the conflicting PnP path.

The first Worker secret upload used Windows line-oriented stdin and silently stored a trailing newline. Better Auth returned `200` because delivery ran in the request background, while Worker tail exposed Alibaba SMTP `526 Authentication failure`. Rewriting both mailbox secrets in one JSON `wrangler secret bulk` operation removed the newline; a real OTP request for the sole unverified account then completed with no Worker exception. Treat a `200` OTP response as generation acceptance, not proof of SMTP delivery; inspect Worker exceptions when delivery is disputed.

PR `#14` merged the SMTP source as commit `a2e0323...`; CI/CD run `33720582271` promoted tagged Worker version `0299d333-37b2-4b61-99b1-89e673cf3503`. A post-CD OTP request completed with no Worker exceptions, all public health probes returned `200`, and OpenShip remained 16/16 healthy.

The QQ recipient still reported no message and the no-reply inbox had no bounce. A copy delivered inside Alibaba Mail showed Alibaba did not add the absent `Date` or `Message-ID` headers. PR `#15` added both headers and merged as `eaee369...`; CI/CD run `33721478814` promoted tagged Worker version `92525f1e-711e-400c-8c94-003877d6f554`. A post-CD OTP request completed without a Worker exception, and an independent no-reply message reached the authorized Tencent test mailbox in about 12 seconds.

## Database and state recovery

- PostgreSQL primary: A. Redis and WuKongIM also live only on A.
- Back up PostgreSQL to B and/or existing object storage; optional asynchronous WAL is acceptable.
- Failover is manual: verify and fence/stop the old primary before promoting anything. Two nodes alone do not provide safe automatic quorum.
- Do not force two-node Patroni, Sentinel, or etcd elections.
- Keep Host Action idempotency, AgentOS fences, LLM ledger, audit records, WuKongIM durable messages, Open Notebook's independent Surreal schema, and R2 objects in recovery planning.
- A hard AgentOS failure can wait up to the 45-second lease before reclaim. It restores persistent database/message/idempotency state, not in-process variables or unpersisted files.

## Known OpenShip behavior

- `db-migrate` exits 0 and remains stopped. A health watcher/refresh once tried to redeploy the gone one-shot; confirm exit code before treating absence as failure.
- `post_projects_by_id_routing_retry` cleared a stale LingxiLit route warning without rebuilding the app.
- Direct Edge pulls from GHCR can be denied; the mirror is the working path.
- `restart` does not apply stale environment. Use a refresh deployment.
- Git clone on destination hosts may fail without credentials and fall back to API-host clone/transfer.
- Service rows can override Compose and survive project updates. Reconcile drift deliberately; do not blindly accept or discard all changes.
- OpenShip upstream acceptance does not reliably expand variables in host binds. Keep fixed production bind addresses explicit in the OpenShip manifests and verify the resulting service rows.

## OpenShip control-plane host I/O incident

The management host is `aly` (`47.93.133.55`), separate from Server A/B. After a 2026-09-02 reboot, sustained sampling proved OpenShip itself was not the high-I/O source:

- OpenShip 0.6.9 runs through `/etc/systemd/system/openship.service`; its CLI, API, and dashboard are native Node processes under `/root/.openship`, not Docker containers.
- `pgsql.service` still uses Baota-installed PostgreSQL under `/www/server/pgsql`; do not repeat Server B's destructive `/www` removal on this host.
- Baota `nginx.service`, `bt.service`, `site_total.service`, and `BT-FirewallServices.service` are disabled or masked. The official `openship-edge:0.6.9` container now owns public `80/443`; Wego and OpenShip management routes no longer depend on Baota Nginx.
- Unrelated long-running WegoLibrary and Memos containers remain on the host. WegoLibrary is required; its backend performs a hard-coded all-user keep-alive every five minutes and logs each success at INFO. Memos used about 23 MB and negligible I/O, so it was left running.
- Docker previously used unlimited `json-file` logs; WegoLibrary backend had accumulated a 153 MB log containing session identifiers. `/etc/docker/daemon.json` now defaults to Docker's `local` driver with `max-size=10m`, `max-file=3`, and compression. The previous file is backed up as `/etc/docker/daemon.json.codex-pre-io-20260902192625`. All three containers were recreated without changing bind-mounted data so they inherited the new driver and the old JSON logs disappeared.

The four-minute verification included a Wego keep-alive boundary: device utilization stayed at or below 0.84%, `iowait` was 0, Wego averaged about 8.4 KB/s writes, OpenShip API about 0.33 KB/s, and swap remained unused. For recurrence, measure `iostat -xz`, `pidstat -d`, `/proc/<pid>/io`, and container log growth before changing OpenShip polling. Do not patch Wego code inside a live container; change its source logging level in its own repository if application writes become material.

On 2026-09-02, a Baota `/api/` location intercepted OpenShip's same-origin MCP path `/api/proxy/api/mcp`, producing 404 responses. The durable fix was to stop Baota's public proxy and run the official OpenShip Edge. Bare 0.6.9 wrote `--managed-edge` but did not create the edge container, so operations started the cached official image with OpenShip's own container name, host network, restart policy, and four canonical mounts. A minimal control-plane vhost proxies every path to Dashboard `127.0.0.1:3002`; the Dashboard alone owns `/api/proxy/*`, avoiding a competing `/api/` location. Wego was added as a tracked Docker Compose project on port `18081`; OpenShip issued its certificate, and its Edge vhost serves `golib.christmas1314.xyz`. Do not run a full Baota site migration because it would re-expose retired panel, Memos, and unrelated vhosts.

## Verification gates used during the implementation

Repository changes were expected to pass:

```text
npm run lint
npm run typecheck
npm run server:typecheck
npm run admin:typecheck
npm run build
npm run admin:build
npm test
npm run test:eval / npm run eval:check
npm run db:migrate twice
npm run test:integration
```

Deployment contract tests covered the two AgentOS projects, explicit App A/B service sets, reusable volume names, no 5190 mapping, and immutable component-scoped CI tags. AgentOS integration tests covered migration idempotency, dual-node claims, affinity, healthy-owner protection, timeout takeover/Home epoch, fences, SIGTERM drain, hard-failure reclaim, current-fence stream validation, Host Action idempotency, cancellation, and preemption.

The raw session source used for this operational record was `C:\Users\34395\.codex\sessions\2026\09\02\rollout-2026-09-02T08-15-21-01a05f78-674b-7e63-80de-d6f646064a16.jsonl` (about 19.8 MB, 7,648 records). Do not treat encrypted values or secrets embedded in that session as safe to publish.
