import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { computeScope } from './ci-scope.mjs'
import { updateImageTags } from './update-deployment-images.mjs'
import { buildReleaseRequest, deploymentImages } from './trigger-openship-release.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('production Open Notebook receives only the explicit RAG environment', () => {
  const compose = read('docker-compose.production.yml')
  const service = compose.slice(compose.indexOf('  open-notebook:'), compose.indexOf('  wukongim:'))

  assert.doesNotMatch(service, /env_file:/)
  for (const variable of [
    'OPEN_NOTEBOOK_PASSWORD',
    'OPEN_NOTEBOOK_SURREAL_PASSWORD',
    'R2_ENDPOINT',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_EMBEDDING_MODEL',
  ]) assert.match(service, new RegExp(`${variable}:`))
  assert.match(service, /OPENAI_API_KEY: \$\{OPEN_NOTEBOOK_PASSWORD:\?/)
  assert.match(service, /OPENAI_BASE_URL: http:\/\/lingxiloop:5181\/internal\/open-notebook\/v1/)
  assert.match(service, /OPENAI_EMBEDDING_MODEL: \$\{OPENAI_EMBEDDING_MODEL:\?/)

  assert.match(service, /supervisorctl status rag-api/)
  assert.match(service, /supervisorctl status rag-worker/)
  assert.match(service, /http:\/\/localhost:5055\/readyz/)
  assert.doesNotMatch(compose, /SURREAL_EXPERIMENTAL_GRAPHQL/)
})

test('packaged and published stacks select the RAG-only image', () => {
  const packaged = read('docker-compose.mvp.yml')
  const workflow = read('.github/workflows/ci.yml')
  const scope = read('scripts/ci-scope.mjs')
  const smoke = read('server/scripts/knowledge-rag-smoke.ts')
  const production = read('docker-compose.production.yml')
  const deploy = read('scripts/deploy-production.sh')

  const packagedService = packaged.slice(packaged.indexOf('  open-notebook:'), packaged.indexOf('  wukongim:'))
  assert.match(packagedService, /image: .*lingxiloop-open-notebook/)
  assert.doesNotMatch(packagedService, /build:/)
  assert.match(scope, /'lingxiloop-open-notebook'[\s\S]*'lingxiloop-rag'/)
  assert.match(workflow, /needs: \[changes, checks, integration\]/)
  assert.match(workflow, /GITHUB_REPOSITORY_OWNER,,/)
  assert.match(workflow, /:\$\{\{ github\.sha \}\}/)
  assert.match(workflow, /platforms: linux\/amd64/)
  assert.match(workflow, /update-deployment-images\.mjs/)
  assert.match(workflow, /dorny\/paths-filter@v4[\s\S]*predicate-quantifier: some-with-excludes/)
  assert.doesNotMatch(workflow, /- 'third_party\/open-notebook\/\*\*'/)
  assert.doesNotMatch(workflow, /setup-qemu|:mvp/)
  assert.match(smoke, /createSecondProject/)
  assert.match(smoke, /seedOtherCompany/)
  assert.match(smoke, /otherProjectSourceId/)
  assert.match(smoke, /otherCompanySourceId/)
  assert.doesNotMatch(`${production}\n${deploy}`, /KNOWLEDGE_SMOKE_EMBEDDING_CONTROL|CONTROL_TOKEN/)
  assert.doesNotMatch(packaged, /8502/)
})

test('native v1 schema makes source chunks the only searchable Surreal corpus', () => {
  const migration = read('third_party/open-notebook/open_notebook/rag/schema.surrealql')

  assert.match(migration, /DEFINE FUNCTION fn::scoped_vector_search/)
  assert.match(migration, /DEFINE FUNCTION fn::scoped_text_search/)
  assert.equal((migration.match(/FROM source_embedding/g) ?? []).length, 2)
  assert.doesNotMatch(migration, /FROM\s+source_insight\b/i)
  assert.doesNotMatch(migration, /FROM\s+note\b/i)
  assert.match(migration, /source\.id IN \$source_ids/g)
})

test('the production entrypoint has the exact RAG routes and one worker command', () => {
  const main = read('third_party/open-notebook/api/rag_main.py')
  const router = read('third_party/open-notebook/api/rag_router.py')
  const commands = read('third_party/open-notebook/rag_commands.py')
  const supervisor = read('third_party/open-notebook/supervisord.rag.conf')
  const dockerfile = read('third_party/open-notebook/Dockerfile')
  const routePattern = /@(app|router)\.(get|post|put|delete)\(\s*["']([^"']+)["']/g
  const routes = [...`${main}\n${router}`.matchAll(routePattern)]
    .map(([, owner, method, path]) => `${method.toUpperCase()} ${owner === 'router' ? '/api' : ''}${path}`)
    .sort()

  assert.deepEqual(routes, [
    'DELETE /api/sources/{source_id}',
    'GET /api/sources/{source_id}',
    'GET /api/sources/{source_id}/presentation-material',
    'GET /api/sources/{source_id}/status',
    'GET /health',
    'GET /readyz',
    'POST /api/notebooks',
    'POST /api/search',
    'POST /api/sources/json',
    'POST /api/sources/{source_id}/retry',
    'PUT /api/notebooks/{notebook_id}',
  ].sort())
  assert.equal((commands.match(/@command\(/g) ?? []).length, 1)
  assert.match(commands, /@command\(\s*"process_source"/)
  assert.deepEqual(
    [...supervisor.matchAll(/^\[program:([^\]]+)]/gm)].map((match) => match[1]),
    ['rag-api', 'rag-worker'],
  )
  assert.match(supervisor, /--import-modules rag_commands/)

  const ragStart = dockerfile.indexOf(' AS lingxiloop-rag')
  const ragEnd = dockerfile.indexOf('\nFROM ', ragStart + 1)
  assert.ok(ragStart > 0 && ragEnd > ragStart, 'Dockerfile must contain a bounded lingxiloop-rag target')
  const ragTarget = dockerfile.slice(ragStart, ragEnd)
  assert.doesNotMatch(ragTarget, /node(?:js)?|8502|frontend/i)
  assert.match(dockerfile, /rag-backend-builder[\s\S]*uv sync --frozen --no-dev --no-default-groups/)
})

test('removed Open Notebook capabilities cannot be re-enabled by deployment configuration', () => {
  const files = [
    '.env.example',
    'docker-compose.production.yml',
    'docker-compose.mvp.yml',
    'scripts/deploy-production.sh',
  ].map(read).join('\n')

  assert.doesNotMatch(files, /OPEN_NOTEBOOK_ENCRYPTION_KEY/)
  assert.doesNotMatch(files, /OPEN_NOTEBOOK_(?:CHAT|STRATEGY|ANSWER|FINAL_ANSWER)_MODEL/)
})

test('normal production deploy revalidates RAG and recreates Agent OS', () => {
  const deploy = read('scripts/deploy-production.sh')
  assert.match(deploy, /supervisorctl status rag-api/)
  assert.match(deploy, /supervisorctl status rag-worker/)
  assert.match(deploy, /--force-recreate agent-os/)
  assert.match(deploy, /knowledge-rag-smoke\.ts/)
})

test('OpenShip knowledge services receive writable storage and the control plane URL', () => {
  const compose = read('deploy/openship/knowledge-agent.yml')

  assert.match(compose, /surrealdb:[\s\S]*?rocksdb:\/home\/nonroot\/open-notebook\.db/)
  assert.match(compose, /SURREAL_PASS: \$\{OPEN_NOTEBOOK_SURREAL_PASSWORD:\?OPEN_NOTEBOOK_SURREAL_PASSWORD is required}/)
  assert.doesNotMatch(compose, /--pass/)
  assert.match(compose, /10\.20\.0\.3:5055:5055/)
  assert.match(compose, /supervisorctl -s unix:\/\/\/tmp\/supervisor\.sock status rag-api/)
  assert.match(compose, /OPEN_NOTEBOOK_WORKER_MAX_TASKS: "1"/)
  assert.equal((compose.match(/\$\{LINGXILOOP_CONTROL_PLANE_URL:\?/g) ?? []).length, 1)
  assert.doesNotMatch(compose, /^ {2}agent-os:/m)
  assert.doesNotMatch(compose, /LINGXILOOP_INTERNAL_ORIGIN/)
})

test('OpenShip runs one private Agent OS per host and the Worker only on its selected app project', () => {
  const agent = read('deploy/openship/agent-os.yml')
  const app = read('deploy/openship/app.yml')

  assert.match(agent, /AGENT_OS_WORKER_ID: \$\{AGENT_OS_WORKER_ID:\?AGENT_OS_WORKER_ID must be unique}/)
  assert.match(agent, /AGENT_OS_MAX_CONCURRENT_RUNS: \$\{AGENT_OS_MAX_CONCURRENT_RUNS:-1}/)
  assert.match(agent, /name: \$\{AGENT_OS_VOLUME_NAME:\?AGENT_OS_VOLUME_NAME is required}/)
  assert.doesNotMatch(agent, /^ {4}ports:/m)
  assert.match(app, /AGENT_OS_NODE_TIMEOUT_SECONDS: \$\{AGENT_OS_NODE_TIMEOUT_SECONDS:-15}/)
  assert.match(app, /worker:\r?\n {4}<<: \*runtime\r?\n {4}profiles: \[worker]/)
  assert.match(app, /gateway:\r?\n {4}image: .*lingxiloop-gateway:[0-9a-f]{40}/)
  assert.match(app, /127\.0\.0\.1:8080:8080/)
  assert.match(read('deploy/openship/gateway.Dockerfile'), /FROM nginx:alpine[\s\S]*COPY website \/usr\/share\/nginx\/html/)
  assert.doesNotMatch(app, /AGENT_OS_URL/)
})

test('the gateway uses the备案 ingress and the Worker uses its admin domain', () => {
  const gateway = read('deploy/openship/gateway.conf')
  const core = read('deploy/openship/core-state.yml')
  const worker = read('workers/control-plane/wrangler.jsonc')

  assert.match(gateway, /server 10\.20\.0\.2:5181/)
  assert.match(gateway, /server_name lingxilearn\.cn www\.lingxilearn\.cn/)
  assert.match(gateway, /server_name loop\.lingxilearn\.cn/)
  assert.match(gateway, /server_name im\.lingxilearn\.cn/)
  assert.match(gateway, /proxy_pass http:\/\/10\.20\.0\.2:5200/)
  assert.match(core, /10\.20\.0\.2:5200:5200/)
  assert.doesNotMatch(core, /WUKONG_WS_BIND_IP/)
  assert.match(worker, /"routes": \[\{ "pattern": "admin\.lingxilearn\.cn", "custom_domain": true \}\]/)
  assert.match(worker, /"workers_dev": false/)
  assert.match(worker, /"ORIGIN_BASE_URL": "https:\/\/loop\.lingxilearn\.cn"/)
  assert.match(worker, /"OPENSHIP_BASE_URL": "https:\/\/ops\.christmas1314\.xyz"/)
  assert.match(worker, /"AUTH_ALLOWED_HOSTS": "loop\.lingxilearn\.cn,admin\.lingxilearn\.cn"/)
})

test('main publishes unique tags and updates Compose before Worker deployment', () => {
  const workflow = read('.github/workflows/ci.yml')
  const compose = read('docker-compose.production.yml')
  const serverImage = read('server/docker/lingxiloop-server.Dockerfile')

  assert.match(workflow, /update-manifests:[\s\S]*needs: \[changes, publish\]/)
  assert.match(workflow, /deploy:[\s\S]*needs: \[changes, checks\]/)
  assert.match(workflow, /rollout:[\s\S]*needs: \[update-manifests, deploy\]/)
  assert.match(workflow, /control:d1:remote[\s\S]*wrangler versions upload[\s\S]*wrangler versions deploy/)
  assert.match(workflow, /control_migrations == 'true'[\s\S]*control:d1:remote/)
  assert.match(workflow, /update-deployment-images\.mjs "\$GITHUB_SHA" \$\{\{ needs\.changes\.outputs\.packages \}\}/)
  assert.match(workflow, /rollout:[\s\S]*trigger-openship-release\.mjs/)
  assert.match(workflow, /VITE_TURNSTILE_SITE_KEY=0x4AAAAAAEk9EZhHYeS3szPO/)
  assert.match(serverImage, /ARG VITE_TURNSTILE_SITE_KEY=""[\s\S]*ENV VITE_TURNSTILE_SITE_KEY=\$\{VITE_TURNSTILE_SITE_KEY\}/)
  const imageDigests = Object.fromEntries(['server', 'agent-os', 'wukongim', 'open-notebook', 'gateway']
    .map((name) => [name, `accel.way2api.fun/ghcr.io/example/lingxiloop-${name}:${'a'.repeat(40)}`]))
  const release = buildReleaseRequest('secret', 'a'.repeat(40), 'b'.repeat(40), 'Example/LingxiLoop', imageDigests)
  assert.deepEqual(JSON.parse(release.body), {
    commitSha: 'a'.repeat(40),
    deployCommitSha: 'b'.repeat(40),
    imageDigests,
  })
  assert.deepEqual(deploymentImages(Object.values(imageDigests).map((image) => `image: ${image}`).join('\n')), imageDigests)
  assert.match(release.signature, /^[\w-]{43}$/)
  assert.doesNotMatch(workflow, /image-digest-|api\/internal\/releases/)
  assert.doesNotMatch(workflow, /pages deploy|PRODUCTION_SSH|run: .*deploy-production\.sh/)
  assert.match(compose, /LINGXILOOP_GATEWAY_HMAC_SECRET: \$\{LINGXILOOP_GATEWAY_HMAC_SECRET:\?/)
  assert.match(compose, /AGENT_OS_MAX_CONCURRENT_RUNS: \$\{AGENT_OS_MAX_CONCURRENT_RUNS:-2\}/)
  assert.match(compose, /OPEN_NOTEBOOK_WORKER_MAX_TASKS: \$\{OPEN_NOTEBOOK_WORKER_MAX_TASKS:-1\}/)
})

test('all deployable LingxiLoop images use CI-managed unique tags', () => {
  const manifests = [
    'deploy/openship/agent-os.yml',
    'deploy/openship/app.yml',
    'deploy/openship/core-state.yml',
    'deploy/openship/knowledge-agent.yml',
    'docker-compose.production.yml',
    'docker-compose.mvp.yml',
    'docker-compose.dokploy.yml',
  ].map(read).join('\n')
  const references = [...manifests.matchAll(/image:\s+\S*lingxiloop-[^:\s]+:([^\s]+)/g)]
  assert.equal(references.length, 19)
  assert.ok(references.every((match) => /^[0-9a-f]{40}$/.test(match[1])))
  assert.equal(
    updateImageTags(`image: registry/lingxiloop-server:${'a'.repeat(40)}`, 'b'.repeat(40), ['server']),
    `image: registry/lingxiloop-server:${'b'.repeat(40)}`,
  )
  assert.equal(
    updateImageTags(
      `image: registry/lingxiloop-server:${'a'.repeat(40)}\nimage: registry/lingxiloop-agent-os:${'a'.repeat(40)}`,
      'b'.repeat(40),
      ['server'],
    ),
    `image: registry/lingxiloop-server:${'b'.repeat(40)}\nimage: registry/lingxiloop-agent-os:${'a'.repeat(40)}`,
  )
})

test('CI selects checks and images only for the changed component', () => {
  const web = computeScope({ web: true })
  assert.deepEqual(web.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(web.web, true)
  assert.equal(web.server, false)

  const server = computeScope({ server: true, serverSource: true })
  assert.deepEqual(server.images.map(({ manifest }) => manifest), ['server', 'agent-os'])
  assert.equal(server.integration, true)

  assert.equal(computeScope({ serverDocker: true }).packages, 'server')
  assert.equal(computeScope({ agentDocker: true }).packages, 'agent-os')

  const knowledge = computeScope({ openNotebook: true })
  assert.deepEqual(knowledge.images.map(({ manifest }) => manifest), ['open-notebook'])
  assert.equal(knowledge.deploy_contract, true)

  const control = computeScope({ control: true, controlMigrations: true })
  assert.deepEqual(control.images, [])
  assert.equal(control.control_deploy, true)
  assert.equal(control.control_migrations, true)

  const sharedFrontend = computeScope({ sharedFrontend: true })
  assert.deepEqual(sharedFrontend.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(sharedFrontend.server, false)

  const testRunner = computeScope({ testRunner: true })
  assert.deepEqual(testRunner.images, [])
  assert.equal(testRunner.server, true)
})
