import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { computeScope } from './ci-scope.mjs'
import { updateImageTags } from './update-deployment-images.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('production Open Notebook receives only the explicit RAG environment', () => {
  const compose = read('deploy/arcane/lingxiloop-knowledge-agent/compose.yml')
  const service = compose.slice(compose.indexOf('  open-notebook:'))

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
  assert.match(service, /OPENAI_BASE_URL: "\$\{LINGXILOOP_CONTROL_PLANE_URL:\?[^}]+}\/internal\/open-notebook\/v1"/)
  assert.match(service, /OPENAI_EMBEDDING_MODEL: \$\{OPENAI_EMBEDDING_MODEL:\?/)

  assert.match(service, /supervisorctl .* status rag-api/)
  assert.match(service, /supervisorctl .* status rag-worker/)
  assert.match(service, /http:\/\/localhost:5055\/readyz/)
  assert.doesNotMatch(compose, /SURREAL_EXPERIMENTAL_GRAPHQL/)
})

test('packaged and published stacks select the RAG-only image', () => {
  const packaged = read('docker-compose.mvp.yml')
  const workflow = read('.github/workflows/ci.yml')
  const scope = read('scripts/ci-scope.mjs')
  const smoke = read('server/scripts/knowledge-rag-smoke.ts')

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
  assert.doesNotMatch(packaged, /8502/)
  assert.equal(existsSync(new URL('../docker-compose.production.yml', import.meta.url)), false)
  assert.equal(existsSync(new URL('../docker-compose.dokploy.yml', import.meta.url)), false)
  assert.equal(existsSync(new URL('../scripts/deploy-production.sh', import.meta.url)), false)
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
    'docker-compose.mvp.yml',
    'deploy/arcane/lingxiloop-knowledge-agent/compose.yml',
  ].map(read).join('\n')

  assert.doesNotMatch(files, /OPEN_NOTEBOOK_ENCRYPTION_KEY/)
  assert.doesNotMatch(files, /OPEN_NOTEBOOK_(?:CHAT|STRATEGY|ANSWER|FINAL_ANSWER)_MODEL/)
})

test('Arcane knowledge services receive writable storage and the control plane URL', () => {
  const compose = read('deploy/arcane/lingxiloop-knowledge-agent/compose.yml')

  assert.match(compose, /surrealdb:[\s\S]*?rocksdb:\/home\/nonroot\/open-notebook\.db/)
  assert.match(compose, /SURREAL_PASS: \$\{OPEN_NOTEBOOK_SURREAL_PASSWORD:\?OPEN_NOTEBOOK_SURREAL_PASSWORD is required}/)
  assert.doesNotMatch(compose, /--pass/)
  assert.match(compose, /10\.20\.0\.3:5056:5055/)
  assert.match(compose, /supervisorctl -s unix:\/\/\/tmp\/supervisor\.sock status rag-api/)
  assert.match(compose, /OPEN_NOTEBOOK_WORKER_MAX_TASKS: "1"/)
  assert.equal((compose.match(/\$\{LINGXILOOP_CONTROL_PLANE_URL:\?/g) ?? []).length, 1)
  assert.doesNotMatch(compose, /^ {2}agent-os:/m)
  assert.doesNotMatch(compose, /LINGXILOOP_INTERNAL_ORIGIN/)
})

test('Arcane runs the Worker only on its selected app project', () => {
  const appA = read('deploy/arcane/lingxiloop-app-a/compose.yml')
  const appB = read('deploy/arcane/lingxiloop-app-b/compose.yml')

  assert.match(appA, /10\.20\.0\.2:5183:5181/)
  assert.doesNotMatch(appA, /^ {2}(?:worker|gateway):/m)
  assert.doesNotMatch(appA, /COMPOSE_PROFILES|profiles:/)
  assert.match(appB, /worker:\r?\n {4}<<: \*runtime/)
  assert.match(appB, /gateway-native324:\r?\n {4}image: .*lingxiloop-gateway:[0-9a-f]{40}/)
  assert.match(appB, /127\.0\.0\.1:8081:8080/)
  assert.doesNotMatch(appB, /COMPOSE_PROFILES|profiles:/)
  assert.doesNotMatch(read('deploy/arcane/lingxiloop-app-b/gateway.Dockerfile'), /COPY website/)
  assert.doesNotMatch(`${appA}\n${appB}`, /AGENT_OS_URL/)
})

test('the gateway uses the备案 ingress and the Worker uses its admin domain', () => {
  const gateway = read('deploy/arcane/lingxiloop-app-b/gateway.conf')
  const core = read('deploy/arcane/lingxiloop-core-state/compose.yml')
  const worker = read('workers/control-plane/wrangler.jsonc')

  assert.match(gateway, /server 10\.20\.0\.2:5183/)
  assert.match(gateway, /server_name loop\.lingxilearn\.cn/)
  assert.match(gateway, /upstream control_plane \{[\s\S]*server admin\.lingxilearn\.cn:443 resolve;[\s\S]*keepalive 32;/)
  assert.match(gateway, /location \/api\/ \{[\s\S]*\$http_x_lingxiloop_gateway[\s\S]*return 418;[\s\S]*proxy_pass https:\/\/control_plane;[\s\S]*proxy_ssl_name admin\.lingxilearn\.cn;[\s\S]*proxy_set_header Connection "";/)
  assert.match(gateway, /location @origin_api \{[\s\S]*proxy_pass http:\/\/lingxiloop_web/)
  assert.match(gateway, /server_name im\.lingxilearn\.cn/)
  assert.match(gateway, /proxy_pass http:\/\/10\.20\.0\.2:5201/)
  assert.match(core, /10\.20\.0\.2:5201:5200/)
  assert.doesNotMatch(core, /WUKONG_WS_BIND_IP/)
  assert.match(worker, /"routes": \[\{ "pattern": "admin\.lingxilearn\.cn", "custom_domain": true \}\]/)
  assert.match(worker, /"workers_dev": false/)
  assert.match(worker, /"ORIGIN_BASE_URL": "https:\/\/loop\.lingxilearn\.cn"/)
  assert.match(worker, /"AUTH_ALLOWED_HOSTS": "loop\.lingxilearn\.cn,admin\.lingxilearn\.cn"/)
})

test('Arcane control plane and ingress keep management sockets private', () => {
  const manager = read('deploy/arcane/arcane-manager/compose.yml')
  const agent = read('deploy/arcane/arcane-agent/compose.yml')
  const alyIngress = read('deploy/arcane/aly-ingress/compose.yml')
  const appIngress = read('deploy/arcane/server-b-ingress/compose.yml')
  const appRoutes = read('deploy/arcane/server-b-ingress/dynamic.yml')

  assert.match(manager, /manager:v2\.10\.2/)
  assert.match(agent, /agent:v2\.10\.2/)
  assert.match(manager, /127\.0\.0\.1:3552:3552/)
  assert.match(agent, /EDGE_TRANSPORT: poll/)
  assert.doesNotMatch(agent, /3553:3553/)
  assert.match(`${manager}\n${agent}`, /wollomatic\/socket-proxy:1\.13\.1/)
  assert.doesNotMatch(`${alyIngress}\n${appIngress}`, /docker\.sock|providers\.docker/)
  assert.match(appIngress, /80:80[\s\S]*443:443/)
  for (const host of ['lingxilearn.cn', 'www.lingxilearn.cn', 'loop.lingxilearn.cn', 'im.lingxilearn.cn', 'openlit.lingxilearn.cn', 'uptime.lingxilearn.cn']) {
    assert.match(appRoutes, new RegExp(host.replaceAll('.', '\\.')))
  }
})

test('main publishes changed images and rolls out a complete immutable release', () => {
  const workflow = read('.github/workflows/ci.yml')
  const serverImage = read('server/docker/lingxiloop-server.Dockerfile')

  assert.match(workflow, /options: \[[^\]]*release\]/)
  assert.equal((workflow.match(/github\.event_name == 'push' \|\| needs\.changes\.outputs\.release == 'true'/g) ?? []).length, 3)
  assert.match(workflow, /update-manifests:[\s\S]*needs: \[changes, checks, publish\]/)
  assert.match(workflow, /needs\.publish\.result == 'success'[\s\S]*needs\.changes\.outputs\.deploy_contract == 'true'/)
  assert.match(workflow, /deploy:[\s\S]*needs: \[changes, checks(?:, [^\]]+)?\]/)
  assert.match(workflow, /rollout:[\s\S]*needs: \[update-manifests, deploy(?:, [^\]]+)?\]/)
  assert.match(workflow, /control:d1:remote[\s\S]*wrangler versions upload[\s\S]*wrangler versions deploy/)
  assert.match(workflow, /control_migrations == 'true'[\s\S]*control:d1:remote/)
  assert.match(workflow, /update-deployment-images\.mjs "\$GITHUB_SHA" \$\{\{ needs\.changes\.outputs\.packages \}\}/)
  assert.match(workflow, /rollout:[\s\S]*trigger-arcane-git-sync\.mjs/)
  assert.match(workflow, /ARCANE_GIT_SYNC_WEBHOOK_URLS: \$\{\{ secrets\.ARCANE_GIT_SYNC_WEBHOOK_URLS \}\}/)
  assert.match(workflow, /VITE_TURNSTILE_SITE_KEY=0x4AAAAAAEsX5eyOl1nAe5i9/)
  assert.match(serverImage, /ARG VITE_TURNSTILE_SITE_KEY=""[\s\S]*ENV VITE_TURNSTILE_SITE_KEY=\$\{VITE_TURNSTILE_SITE_KEY\}/)
  assert.doesNotMatch(workflow, /RELEASE_HMAC_SECRET|api\/internal\/releases/)
  assert.doesNotMatch(workflow, /pages deploy|PRODUCTION_SSH|run: .*deploy-production\.sh/)
})

test('all deployable LingxiLoop images use CI-managed unique tags', () => {
  const manifests = [
    'deploy/arcane/lingxiloop-app-a/compose.yml',
    'deploy/arcane/lingxiloop-app-b/compose.yml',
    'deploy/arcane/lingxiloop-core-state/compose.yml',
    'deploy/arcane/lingxiloop-knowledge-agent/compose.yml',
  ].map(read).join('\n')
  const references = [...manifests.matchAll(/image:\s+\S*lingxiloop-[^:\s]+:([^\s]+)/g)]
  assert.equal(references.length, 5)
  assert.ok(references.every((match) => /^[0-9a-f]{40}$/.test(match[1])))
  assert.equal(
    updateImageTags(`image: registry/lingxiloop-server:${'a'.repeat(40)}`, 'b'.repeat(40), ['server']),
    `image: registry/lingxiloop-server:${'b'.repeat(40)}`,
  )
  assert.equal(
    updateImageTags(
      `image: registry/lingxiloop-server:${'a'.repeat(40)}\nimage: registry/lingxiloop-wukongim:${'a'.repeat(40)}`,
      'b'.repeat(40),
      ['server'],
    ),
    `image: registry/lingxiloop-server:${'b'.repeat(40)}\nimage: registry/lingxiloop-wukongim:${'a'.repeat(40)}`,
  )
})

test('CI selects checks and image publishing by component', () => {
  const web = computeScope({ web: true })
  assert.deepEqual(web.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(web.web, true)
  assert.equal(web.server, false)

  const server = computeScope({ server: true, serverSource: true })
  assert.deepEqual(server.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(server.integration, true)

  assert.equal(computeScope({ serverDocker: true }).packages, 'server')

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

  const deployment = computeScope({ deployment: true })
  assert.deepEqual(deployment.images.map(({ manifest }) => manifest), ['server'])
  assert.equal(deployment.web, true)
  assert.equal(deployment.deploy_contract, true)

  assert.equal(computeScope({}, 'gateway').packages, 'gateway')
  assert.deepEqual(computeScope({}, 'release').images.map(({ manifest }) => manifest), ['server', 'wukongim', 'open-notebook', 'gateway'])
  assert.deepEqual(computeScope({ release: true }).images.map(({ manifest }) => manifest), ['server', 'wukongim', 'open-notebook', 'gateway'])
})
