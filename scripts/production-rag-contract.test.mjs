import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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

test('packaged and CI Compose stacks select the RAG-only image', () => {
  const packaged = read('docker-compose.mvp.yml')
  const ci = read('docker-compose.mvp.ci.yml')
  const workflow = read('.github/workflows/ci.yml')
  const quality = read('.github/workflows/_quality.yml')
  const smoke = read('server/scripts/knowledge-rag-smoke.ts')
  const production = read('docker-compose.production.yml')
  const deploy = read('scripts/deploy-production.sh')

  const packagedService = packaged.slice(packaged.indexOf('  open-notebook:'), packaged.indexOf('  wukongim:'))
  assert.match(packagedService, /image: .*lingxiloop-open-notebook/)
  assert.doesNotMatch(packagedService, /build:/)
  assert.match(ci, /target: lingxiloop-rag/)
  assert.match(workflow, /package: lingxiloop-open-notebook[\s\S]*target: lingxiloop-rag/)
  assert.match(ci, /fake-embedding-provider:[\s\S]*fake-embedding-provider\.mjs/)
  assert.match(ci, /OPENAI_BASE_URL: http:\/\/lingxiloop:5181\/internal\/open-notebook\/v1/)
  assert.match(ci, /CONTROL_TOKEN: ci-embedding-control-token-not-for-prod/)
  assert.match(quality, /knowledge-rag-smoke\.ts/)
  assert.match(quality, /KNOWLEDGE_SMOKE_EMBEDDING_CONTROL_URL=/)
  assert.match(quality, /! command -v node/)
  assert.match(quality, /test ! -d \/app\/frontend/)
  assert.match(quality, /test "\$\(supervisorctl status \| wc -l\)" -eq 2/)
  assert.match(quality, /stats\.embeddingRequests < 1/)
  assert.match(quality, /stats\.blockedEmbeddingRequests < 1/)
  assert.match(quality, /stats\.waitingRequests !== 0/)
  assert.match(quality, /stats\.chatRequests !== 0/)
  assert.match(quality, /stats\.otherRequests !== 0/)
  for (const dependency of [
    'content-core',
    'langgraph',
    'esperanto',
    'ai-prompter',
    'podcast-creator',
    'nodejs-wheel-binaries',
    'python-pptx',
    'langchain-openai',
    'langchain-anthropic',
    'langchain-ollama',
    'langchain-google-genai',
    'langchain-groq',
    'langchain-mistralai',
  ]) assert.match(quality, new RegExp(`"${dependency}"`))
  assert.match(smoke, /createSecondProject/)
  assert.match(smoke, /seedOtherCompany/)
  assert.match(smoke, /otherProjectSourceId/)
  assert.match(smoke, /otherCompanySourceId/)
  assert.doesNotMatch(`${production}\n${deploy}`, /KNOWLEDGE_SMOKE_EMBEDDING_CONTROL|CONTROL_TOKEN/)
  assert.doesNotMatch(`${packaged}\n${ci}`, /8502/)
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
    'docker-compose.mvp.ci.yml',
    'scripts/deploy-production.sh',
  ].map(read).join('\n')

  assert.doesNotMatch(files, /OPEN_NOTEBOOK_ENCRYPTION_KEY/)
  assert.doesNotMatch(files, /OPEN_NOTEBOOK_(?:CHAT|STRATEGY|ANSWER|FINAL_ANSWER)_MODEL/)
})

test('empty production rebuild is explicit, data-guarded and RAG-gated', () => {
  const script = read('scripts/rebuild-empty-production.sh')

  assert.match(script, /EMPTY_PRODUCTION_REBUILD_CONFIRM.*ERASE-EMPTY-PRODUCTION/)
  for (const table of ['users', 'companies', 'conversations', 'agent_work_items', 'knowledge_sources']) {
    assert.match(script, new RegExp(`count\\(\\*\\) FROM ${table}`))
  }
  assert.match(script, /compose down --remove-orphans/)
  assert.doesNotMatch(script, /docker compose down[^\n]*--volumes/)
  assert.match(script, /label=com\.docker\.compose\.project=lingxiloop/)
  assert.match(script, /knowledge_prefix="knowledge-sources\/"/)
  assert.match(script, /s3 rm "s3:\/\/\$\{r2_bucket\}\/\$\{knowledge_prefix\}" --recursive/)
  assert.match(script, /s3 rm "s3:\/\/\$\{r2_bucket\}\/\$\{open_notebook_prefix\}" --recursive/)
  assert.match(script, /sh \.\/scripts\/deploy-production\.sh/)
  assert.match(script, /> \.knowledge-plane-native-v1/)
})

test('normal production deploy revalidates RAG and recreates Agent OS', () => {
  const deploy = read('scripts/deploy-production.sh')
  assert.match(deploy, /supervisorctl status rag-api/)
  assert.match(deploy, /supervisorctl status rag-worker/)
  assert.match(deploy, /--force-recreate agent-os/)
  assert.match(deploy, /knowledge-rag-smoke\.ts/)
})
