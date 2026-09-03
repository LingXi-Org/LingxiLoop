# Environment-variable contract

This file records names, public values, ownership, and equality rules. It intentionally excludes all plaintext credentials and OpenShip-encrypted values.

## Secret handling

- Local source directory: `D:\Documents\OpenShip`. Its `.txt` files contain plaintext secrets; never commit them, quote their values, attach them to logs, or copy them into this skill.
- In OpenShip, mark database URLs/passwords, API keys, service tokens, webhook/HMAC secrets, R2 credentials, registry credentials, and OAuth client secrets as secrets.
- When comparing two projects, compare secret equality through OpenShip metadata or hashes inside the target containers without returning values.
- OpenShip masks environment fields but does not mask secrets embedded in `command` or `commandArgv`. SurrealDB credentials therefore use environment variables; never move them back into its command.

## Local source files

The filenames are historical and are not reliable ownership boundaries. Select values by key and target service.

### `D:\Documents\OpenShip\core.txt` (579 bytes)

`LINGXILOOP_INTERNAL_ORIGIN`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `PRIVATE_BIND_IP`, `REDIS_MAXMEMORY`, `WK_CLUSTER_JOIN_TOKEN`, `WUKONG_API_TOKEN`, `WUKONG_GOMAXPROCS`, `WUKONG_GOMEMLIMIT`, `WUKONG_WEBHOOK_SECRET`, `WUKONG_WS_BIND_IP`.

- The OpenShip core manifest uses explicit `10.20.0.2` host binds for PostgreSQL, Redis, WuKongIM API, and WuKongIM WebSocket because OpenShip's upstream-accept path does not expand bind variables. `PRIVATE_BIND_IP` and `WUKONG_WS_BIND_IP` are legacy/unused there.
- Server A services must never use `0.0.0.0` host binds.
- `LINGXILOOP_INTERNAL_ORIGIN` points WuKongIM webhooks to API-A over the private network, not to an obsolete public origin hostname.

### `D:\Documents\OpenShip\db.txt` (200 bytes)

`DOCKER_PORT`, `OPENLIT_DB_NAME`, `OPENLIT_DB_PASSWORD`, `OPENLIT_DB_USER`, `PORT`.

Map these LingxiLit inputs to the deployed services:

- ClickHouse: `OPENLIT_DB_NAME -> CLICKHOUSE_DATABASE`, `OPENLIT_DB_USER -> CLICKHOUSE_USER`, `OPENLIT_DB_PASSWORD -> CLICKHOUSE_PASSWORD`.
- OpenLit: the same values become `INIT_DB_DATABASE`, `INIT_DB_USERNAME`, and `INIT_DB_PASSWORD`; use `INIT_DB_HOST=clickhouse`, `INIT_DB_PORT=8123`.
- `PORT=3000` and `DOCKER_PORT=3000`.

### `D:\Documents\OpenShip\openlit.txt` (1165 bytes)

The user identified this as a LingxiLit/OpenLit deployment source, but its contents also hold AgentOS and knowledge-service settings. Route by key rather than copying the whole file into one project:

`AGENT_OS_KERNEL_IDLE_MS`, `AGENT_OS_MAX_CONCURRENT_RUNS`, `AGENT_OS_MAX_KERNELS`, `AGENT_OS_SERVICE_TOKEN`, `AGENT_OS_SHUTDOWN_GRACE_MS`, `AGENT_OS_WORKER_ID`, `LINGXILOOP_INTERNAL_ORIGIN`, `LINGXILOOP_LOG_LEVEL`, `OPEN_NOTEBOOK_PASSWORD`, `OPEN_NOTEBOOK_R2_PREFIX`, `OPEN_NOTEBOOK_SURREAL_PASSWORD`, `OPEN_NOTEBOOK_WORKER_MAX_TASKS`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_MODEL`, `OPENLIT_PRICING_JSON`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_VERSION`, `PRIVATE_BIND_IP`, `R2_ACCESS_KEY_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_SECRET_ACCESS_KEY`.

- `OPENLIT_PRICING_JSON` is a legacy spelling. LingxiLoop manifests consume `LINGXILIT_PRICING_JSON`.
- `AGENT_OS_WORKER_ID` cannot be copied unchanged to both nodes; set `agent-os-a` and `agent-os-b` explicitly.
- Project-specific bind IP and callback values must be overridden according to the tables below.

### `D:\Documents\OpenShip\webab.txt` (1892 bytes)

`AGENT_OS_SERVICE_TOKEN`, `AGENT_OS_URL`, `DATABASE_POOL_MAX`, `DATABASE_URL`, `EMAIL_DOMAIN`, `INSTANCE_ID`, `LINGXILOOP_CORS_ORIGINS`, `LINGXILOOP_GATEWAY_HMAC_SECRET`, `LINGXILOOP_INVITE_BASE_URL`, `LINGXILOOP_LOG_LEVEL`, `LINGXILOOP_PUBLIC_ORIGIN`, `METRICS_BEARER_TOKEN`, `OPEN_NOTEBOOK_PASSWORD`, `OPEN_NOTEBOOK_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_MODEL`, `OPENLIT_PRICING_JSON`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `PRESENTATION_HTML_ENABLED`, `R2_ACCESS_KEY_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_BASE`, `R2_SECRET_ACCESS_KEY`, `R2_URL_SIGNING_SECRET`, `R2_URL_TTL_SECONDS`, `REDIS_URL`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `WUKONG_API_TOKEN`, `WUKONG_API_URL`, `WUKONG_USER_TOKEN_SECRET`, `WUKONG_WEBHOOK_SECRET`, `WUKONG_WS_PUBLIC_URL`.

- `AGENT_OS_URL` is obsolete. API readiness and dispatch use the shared AgentOS worker heartbeat/work queue; do not configure `AGENT_OS_URL` or `AGENT_OS_ENDPOINTS`.
- `OPENLIT_PRICING_JSON` must be renamed to `LINGXILIT_PRICING_JSON` for current manifests.
- `WUKONG_USER_TOKEN_SECRET` may be used by other runtime code but is not present in the current OpenShip App A/B environment lists; verify code requirements before adding it.

## App A and App B

OpenShip runtime environment keys for API and Worker:

```text
PORT
NODE_ENV
R2_BUCKET
REDIS_URL
INSTANCE_ID
R2_ENDPOINT
DATABASE_URL
EMAIL_DOMAIN
NODE_OPTIONS
OPENAI_MODEL
WUKONG_WS_URL
OPENAI_API_KEY
R2_PUBLIC_BASE
RESEND_API_KEY
WUKONG_API_URL
OPENAI_BASE_URL
R2_ACCESS_KEY_ID
WUKONG_API_TOKEN
DATABASE_POOL_MAX
OPEN_NOTEBOOK_URL
OPENAI_IMAGE_MODEL
R2_URL_TTL_SECONDS
LINGXILOOP_LOG_LEVEL
METRICS_BEARER_TOKEN
R2_SECRET_ACCESS_KEY
OPEN_NOTEBOOK_ENABLED
R2_URL_SIGNING_SECRET
RESEND_WEBHOOK_SECRET
WUKONG_WEBHOOK_SECRET
AGENT_OS_SERVICE_TOKEN
LINGXILIT_PRICING_JSON
OPENAI_EMBEDDING_MODEL
OPEN_NOTEBOOK_PASSWORD
LINGXILOOP_CORS_ORIGINS
LINGXILOOP_PUBLIC_ORIGIN
PRESENTATION_HTML_ENABLED
LINGXILOOP_INVITE_BASE_URL
OTEL_EXPORTER_OTLP_HEADERS
OTEL_DEPLOYMENT_ENVIRONMENT
OTEL_EXPORTER_OTLP_ENDPOINT
AGENT_OS_NODE_TIMEOUT_SECONDS
LINGXILOOP_GATEWAY_HMAC_SECRET
```

The only project expansion value is `WUKONG_WS_PUBLIC_URL`; inside the container it becomes `WUKONG_WS_URL`. `APP_BIND_IP` and `COMPOSE_PROFILES` were deleted from both projects because the explicit App A/B manifests own placement and service selection.

Shared current non-secret runtime values:

```dotenv
PORT=5181
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=320
DATABASE_POOL_MAX=8
AGENT_OS_NODE_TIMEOUT_SECONDS=15
WUKONG_API_URL=http://10.20.0.2:5001
WUKONG_WS_URL=wss://im.lingxilearn.cn
OPEN_NOTEBOOK_ENABLED=true
OPEN_NOTEBOOK_URL=http://10.20.0.3:5055
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Qwen/Qwen3.5-4B
OPENAI_EMBEDDING_MODEL=BAAI/bge-m3
OPENAI_IMAGE_MODEL=
OTEL_DEPLOYMENT_ENVIRONMENT=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://10.20.0.3:4318
LINGXILOOP_LOG_LEVEL=warn
LINGXILOOP_PUBLIC_ORIGIN=https://loop.lingxilearn.cn
LINGXILOOP_INVITE_BASE_URL=https://loop.lingxilearn.cn
LINGXILOOP_CORS_ORIGINS=https://admin.lingxilearn.cn
R2_PUBLIC_BASE=https://lingxi-assets.way2api.fun
R2_URL_TTL_SECONDS=3600
EMAIL_DOMAIN=
PRESENTATION_HTML_ENABLED=false
```

State endpoint shapes, with credentials redacted:

```dotenv
DATABASE_URL=postgresql://<user>:<secret>@10.20.0.2:5432/lingxiloop
REDIS_URL=redis://10.20.0.2:6379
```

Node differences:

| Project | `INSTANCE_ID` | Manifest | Host bind / services |
| --- | --- | --- | --- |
| App A | `app-a` | `deploy/openship/app-a.yml` | `10.20.0.2:5181`; migration and Web only |
| App B | `app-b` | `deploy/openship/app-b.yml` | loopback `5181/8080`; migration, Web, Worker, Gateway |

All other app values must be equal. The 2026-09-02 audit found the two running APIs equal for every shared runtime value.

## AgentOS A and B

Runtime keys:

```text
NODE_ENV
NODE_OPTIONS
OPENAI_MODEL
AGENT_OS_PORT
OPENAI_API_KEY
OPENAI_BASE_URL
OTEL_SERVICE_NAME
AGENT_OS_WORKER_ID
AGENT_OS_HOMES_ROOT
AGENT_OS_MAX_KERNELS
LINGXILOOP_LOG_LEVEL
AGENT_OS_SERVICE_TOKEN
LINGXILIT_PRICING_JSON
AGENT_OS_KERNEL_IDLE_MS
AGENT_OS_SHUTDOWN_GRACE_MS
OTEL_EXPORTER_OTLP_HEADERS
OTEL_DEPLOYMENT_ENVIRONMENT
OTEL_EXPORTER_OTLP_ENDPOINT
AGENT_OS_MAX_CONCURRENT_RUNS
LINGXILOOP_CONTROL_PLANE_URL
```

Shared non-secret values:

```dotenv
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=384
LINGXILOOP_LOG_LEVEL=warn
OTEL_SERVICE_NAME=lingxiloop-agent-os
OTEL_DEPLOYMENT_ENVIRONMENT=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://10.20.0.3:4318
AGENT_OS_PORT=5190
AGENT_OS_MAX_CONCURRENT_RUNS=1
AGENT_OS_MAX_KERNELS=4
AGENT_OS_KERNEL_IDLE_MS=900000
AGENT_OS_SHUTDOWN_GRACE_MS=20000
AGENT_OS_HOMES_ROOT=/var/lib/lingxiloop-agent-os/homes
LINGXILOOP_CONTROL_PLANE_URL=https://loop.lingxilearn.cn
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Qwen/Qwen3.5-4B
```

Node-specific project values:

| Project | Worker ID | Required volume name | Actual mounted volume |
| --- | --- | --- | --- |
| AgentOS-A | `agent-os-a` | `openship-lingxiloop-agent-os-a-agent-os-data` | same |
| AgentOS-B | `agent-os-b` | `openship-lingxiloop-agent-os-b-agent-os-data` | same |

Do not restore the obsolete `openship-lingxiloop-knowledge-agent-agent-os-data` plan unless intentionally recovering that historical volume. Each current AgentOS project has its own independent volume.

## Core state

Project expansion keys:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
REDIS_MAXMEMORY
WUKONG_GOMEMLIMIT
WUKONG_GOMAXPROCS
WK_CLUSTER_JOIN_TOKEN
LINGXILOOP_INTERNAL_ORIGIN
WUKONG_WEBHOOK_SECRET
```

Expected non-secret values:

```dotenv
POSTGRES_DB=lingxiloop
POSTGRES_USER=lingxiloop
REDIS_MAXMEMORY=192mb
WUKONG_GOMEMLIMIT=320MiB
WUKONG_GOMAXPROCS=1
```

The WuKong webhook is built as `${LINGXILOOP_INTERNAL_ORIGIN}/webhooks/wukong?token=<secret>` and should use API-A's private origin. WuKong data lives at `/var/lib/wukongim`.

## Knowledge services

Project expansion keys:

```text
OPEN_NOTEBOOK_SURREAL_PASSWORD
OPEN_NOTEBOOK_PASSWORD
OPEN_NOTEBOOK_WORKER_MAX_TASKS
OPEN_NOTEBOOK_R2_PREFIX
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
LINGXILOOP_CONTROL_PLANE_URL
OPENAI_EMBEDDING_MODEL
```

Open Notebook runtime keys additionally include `SURREAL_URL`, `SURREAL_USER`, `SURREAL_PASSWORD`, `SURREAL_NAMESPACE`, `SURREAL_DATABASE`, `OPEN_NOTEBOOK_R2_ENABLED`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL`. SurrealDB itself receives the same secret as `SURREAL_PASS` and receives `SURREAL_USER=open-notebook`; neither value belongs in its command.

Expected values:

```dotenv
SURREAL_URL=ws://surrealdb:8000/rpc
SURREAL_USER=open-notebook
SURREAL_NAMESPACE=open_notebook
SURREAL_DATABASE=open_notebook
OPEN_NOTEBOOK_WORKER_MAX_TASKS=1
OPEN_NOTEBOOK_R2_ENABLED=true
OPEN_NOTEBOOK_R2_PREFIX=open-notebook
OPENAI_EMBEDDING_MODEL=BAAI/bge-m3
LINGXILOOP_CONTROL_PLANE_URL=https://loop.lingxilearn.cn
OPENAI_BASE_URL=https://loop.lingxilearn.cn/internal/open-notebook/v1
```

The stable `loop` values above are active in the current Open Notebook container. The OpenShip Knowledge project no longer needs `PRIVATE_BIND_IP`; its fixed production bind is explicit in the manifest.

## LingxiLit / OpenLit

ClickHouse runtime keys: `CLICKHOUSE_USER`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_ALWAYS_RUN_INITDB_SCRIPTS`.

OpenLit runtime keys:

```text
PORT
DOCKER_PORT
INIT_DB_HOST
INIT_DB_PORT
OPAMP_CERTS_DIR
OPAMP_LOG_LEVEL
GITHUB_CLIENT_ID
GOOGLE_CLIENT_ID
INIT_DB_DATABASE
INIT_DB_PASSWORD
INIT_DB_USERNAME
OPAMP_ENVIRONMENT
TELEMETRY_ENABLED
SQLITE_DATABASE_URL
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_SECRET
OPAMP_TLS_MAX_VERSION
OPAMP_TLS_MIN_VERSION
OPAMP_TLS_REQUIRE_CLIENT_CERT
OPAMP_TLS_INSECURE_SKIP_VERIFY
```

Current non-secret values:

```dotenv
PORT=3000
DOCKER_PORT=3000
INIT_DB_HOST=clickhouse
INIT_DB_PORT=8123
INIT_DB_DATABASE=openlit
INIT_DB_USERNAME=default
OPAMP_CERTS_DIR=/app/opamp/certs
OPAMP_LOG_LEVEL=info
OPAMP_ENVIRONMENT=production
TELEMETRY_ENABLED=true
SQLITE_DATABASE_URL=file:/app/client/data/data.db
OPAMP_TLS_MIN_VERSION=1.2
OPAMP_TLS_MAX_VERSION=1.3
OPAMP_TLS_REQUIRE_CLIENT_CERT=true
OPAMP_TLS_INSECURE_SKIP_VERIFY=false
```

The ClickHouse database/user/password and OpenLit `INIT_DB_*` values must match exactly.

## Cloudflare Worker management plane

Repository: `workers/control-plane`; Worker name `lingxiloop-control-plane`; sole production URL `https://admin.lingxilearn.cn`. `workers_dev=false`, so the former `https://lingxiloop-control-plane.yangyangli0426.workers.dev` URL is not a fallback.

Checked-in non-secret Wrangler configuration:

```dotenv
workers_dev=false
routes=[{pattern=admin.lingxilearn.cn,custom_domain=true}]
ORIGIN_BASE_URL=https://loop.lingxilearn.cn
OPENSHIP_BASE_URL=https://ops.christmas1314.xyz
AUTH_ALLOWED_HOSTS=loop.lingxilearn.cn,admin.lingxilearn.cn
UPTIME_BASE_URL=https://uptime.lingxilearn.cn
APP_VERSION=0.1.0-beta
OPENSHIP_PROJECT_IDS=proj_khiExWfh7Vsj72VO,proj_5uz48XlBkfJQeNC8,proj_29J2mM47umuIfaDK,proj_IsMy2bWVzEZ7JKEf,proj_frnQUaoQY37ejzL-,proj_CVkF0rOULikADQ-7
OPENSHIP_IMAGE_TARGETS=server:proj_5uz48XlBkfJQeNC8:svc_9RmMHN7M0K1l5Z_1,server:proj_5uz48XlBkfJQeNC8:svc_Y95Qof0wyIdv7klR,server:proj_IsMy2bWVzEZ7JKEf:svc_70YEsZbgYP34z7Hv,server:proj_IsMy2bWVzEZ7JKEf:svc_wm0I2fR_uglJGyWb,server:proj_IsMy2bWVzEZ7JKEf:svc_okKRA-wGrqgFyZAk,agent-os:proj_29J2mM47umuIfaDK:svc_Q97GKa-vK8cH8O_T,agent-os:proj_CVkF0rOULikADQ-7:svc_rT0BSxd8KVNGSWMU,wukongim:proj_khiExWfh7Vsj72VO:svc_R1qn4zHiKjjfY1An,open-notebook:proj_frnQUaoQY37ejzL-:svc_hmGZIaloXJohVV2r,gateway:proj_IsMy2bWVzEZ7JKEf:svc_q7ZcH8px3jsB9qnY
```

D1 binding `DB`, database `lingxiloop-control-plane`, ID `cf22d961-eba4-4d21-b447-4d19ec0ad524`; no pending migrations at the audit.

Required Worker secret names: `BETTER_AUTH_SECRET`, `GATEWAY_HMAC_SECRET`, `OPENSHIP_PAT`, `RELEASE_HMAC_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `TURNSTILE_SECRET_KEY`, and `BOOTSTRAP_ADMIN_TOKEN`. The legacy singular `OPENSHIP_PROJECT_ID` secret may still exist but is unused; project IDs are non-secret checked-in configuration.

Wrangler 4.127.1 was authenticated to account ID `5b726c2a59696a3536a55589a8fad188`. The OAuth scopes allow Worker Versions and D1 deployment but not zone-route mutation, so CI uploads and promotes a version instead of running a route-mutating deploy. The Worker Custom Domain remains declared in Wrangler. Current deployed code version is `1c19b8d8-0cb5-4979-a3b4-f25a88c3e14e`, tagged with source commit `ad9a7f2e8ba3397943babcde1b802edb48e03941` and serving 100% of traffic. The authenticated admin-only topology and deployment endpoints discard services/projects outside the current production allowlists; `/api/control/status-page` aggregates Kuma's public status JSON, and no Kuma API key is stored in Worker configuration. Earlier observed versions are historical.

## GitHub Actions contract

`.github/workflows/ci.yml` uses:

- Production secrets `CLOUDFLARE_API_TOKEN` and `RELEASE_HMAC_SECRET`, plus built-in `GITHUB_TOKEN`. The release secret must equal the Worker secret but its value must never be read or recorded.
- Variable `CLOUDFLARE_ACCOUNT_ID`; optional override `VITE_LINGXILIT_URL` defaults to `https://openlit.lingxilearn.cn` in the production deploy job.
- Node 22.
- Quality, unit/eval, and PostgreSQL/Redis integration gates before publishing.
- Immutable linux/amd64 images for server, AgentOS, WuKongIM, Open Notebook, and Gateway. A deployable change publishes only its affected component images; a `VERSION` release or main-branch manual `workflow_dispatch` with `scope=release` publishes all five.
- `update-manifests` updates only the published component pins in `deploy/openship/*.yml`, commits SHA pins with `[skip ci]`, and exposes that exact manifest commit SHA to rollout. A deployment-only change retains the current complete image set and still rolls out.
- `deploy` applies D1 migrations when needed and uploads/promotes the Worker Version. The signed release handler requires all five independently immutable image references, synchronizes all ten image-bearing service rows, and creates deployments for all six LingxiLoop projects through OpenShip's Dashboard proxy API. The manifest-pin commit is both the release idempotency key and OpenShip deployment commit, so rebuilding the same source commit cannot be mistaken for an earlier rollout. OpenShip project `autoDeploy` remains disabled.

Workflow run `33711770224` tested source/manifest commit `ad9a7f2e8ba3397943babcde1b802edb48e03941`, promoted Worker version `1c19b8d8-0cb5-4979-a3b4-f25a88c3e14e`, retained the four unchanged `b42fef1...` component pins, pinned Gateway to `3b0069a...`, and rolled all six OpenShip projects to `ready`.

Manual release run `33715749321` tested the complete path after commits `303cedb...` and `99f2e43...`: all five images were rebuilt with tag `99f2e43...`, `update-manifests` created `df724bc...`, and six distinct OpenShip deployments reached `ready` at the same version 2.
