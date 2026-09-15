import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Lifecycle, startWorkerTasks, type WorkerTaskDefinition } from '../runtime/lifecycle.js'

test('worker tasks start in registry order and stop exactly once in reverse order', async () => {
  const events: string[] = []
  const tasks: WorkerTaskDefinition[] = ['first', 'second'].map((name) => ({
    name,
    concurrency: 'idempotent',
    start: () => {
      events.push(`start:${name}`)
      return { stop: () => { events.push(`stop:${name}`) } }
    },
  }))
  const lifecycle = new Lifecycle()
  lifecycle.addDisposer('postgres', () => { events.push('stop:postgres') })
  startWorkerTasks(lifecycle, tasks)

  await lifecycle.stop('test')
  await lifecycle.stop('test-again')

  assert.deepEqual(events, [
    'start:first',
    'start:second',
    'stop:second',
    'stop:first',
    'stop:postgres',
  ])
})

test('Worker composition has injectable startup and connection shutdown boundaries', async () => {
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
  process.env.WUKONG_USER_TOKEN_SECRET = 'test-wukong-user-token-secret'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test'
  process.env.REDIS_URL = 'redis://localhost:6379'
  process.env.LINGXILOOP_INVITE_BASE_URL = 'http://localhost:5180'
  const { startWorkerProcess } = await import('../worker.js')
  const events: string[] = []
  const service = await startWorkerProcess({
    initializeStorage: () => { events.push('storage') },
    prepare: async () => { events.push('prepare') },
    startAgentRuntime: async () => { events.push('start:agent-runtime'); return { stop: () => { events.push('stop:agent-runtime') } } },
    startAgentIngress: () => { events.push('start:agent-ingress'); return { stop: () => { events.push('stop:agent-ingress') } } },
    tasks: [{
      name: 'fixture',
      concurrency: 'queue-claim',
      start: () => {
        events.push('start:fixture')
        return { stop: () => { events.push('stop:fixture') } }
      },
    }],
    closeRedis: () => { events.push('stop:redis') },
    closePostgres: () => { events.push('stop:postgres') },
  })

  await service.stop('test')

  assert.deepEqual(events, [
    'storage',
    'prepare',
    'start:agent-runtime',
    'start:agent-ingress',
    'start:fixture',
    'stop:fixture',
    'stop:agent-ingress',
    'stop:agent-runtime',
    'stop:redis',
    'stop:postgres',
  ])
})

test('a failing disposer does not prevent the remaining resources from closing', async () => {
  const events: string[] = []
  const lifecycle = new Lifecycle()
  lifecycle.addDisposer('database', () => { events.push('database') })
  lifecycle.addDisposer('broken-task', () => { throw new Error('stop failed') })

  await assert.rejects(lifecycle.stop('test'), AggregateError)
  assert.deepEqual(events, ['database'])
})

test('Web composition contains no background scheduler or worker startup', async () => {
  const web = await readFile(new URL('../web.ts', import.meta.url), 'utf8')
  const worker = await readFile(new URL('../worker.ts', import.meta.url), 'utf8')
  const starters = [
    'startLearningEffectWorker',
    'startEmailRetryWorker',
    'startEmailGcWorker',
    'startDocumentMentionDeliveryWorker',
    'startDbGcWorker',
    'startKnowledgeWorker',
    'startKnowledgeStorageGc',
    'startCalendarScheduler',
    'startPollExpirationSweeper',
    'startStaleAgentRunSweeper',
  ]
  for (const starter of starters) {
    assert.doesNotMatch(web, new RegExp(`\\b${starter}\\b`))
    assert.match(worker, new RegExp(`\\b${starter}\\b`))
  }
  assert.match(web, /initializeNativeStorage\(\)/)
  assert.match(worker, /initializeStorage\(\)/)
  await assert.rejects(readFile(new URL('../index.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
})

test('every deployment defines an independently runnable worker service', async () => {
  for (const relative of [
    '../../../docker-compose.mvp.yml',
    '../../../deploy/komodo/lingxiloop-app-b/compose.yml',
  ]) {
    const compose = await readFile(new URL(relative, import.meta.url), 'utf8')
    assert.match(compose, /^ {2}worker:\s*$/m)
    assert.match(compose, /command: \["npm", "run", "worker:start"\]/)
  }
})

test('Komodo workers inherit the complete runtime environment', async () => {
  const compose = await readFile(
    new URL('../../../deploy/komodo/lingxiloop-app-b/compose.yml', import.meta.url),
    'utf8',
  )
  assert.match(compose, /WUKONG_WEBHOOK_SECRET: \$\{WUKONG_WEBHOOK_SECRET:\?/)
  assert.match(compose, /WUKONG_USER_TOKEN_SECRET: \$\{WUKONG_USER_TOKEN_SECRET:\?/)
  assert.match(compose, /lingxiloop:\r?\n {4}<<: \*runtime\r?\n {4}environment: \*runtime-environment/)
  assert.match(compose, /worker:\r?\n {4}<<: \*runtime\r?\n {4}environment: \*runtime-environment/)
  assert.match(compose, /db-migrate:\r?\n {4}<<: \*runtime\r?\n {4}environment:\r?\n {6}NODE_ENV: production\r?\n {6}DATABASE_POOL_MAX:[^\n]+\n {6}DATABASE_URL:/)
  assert.match(compose, /db-migrate:[\s\S]*?restart: on-failure/)
  assert.match(compose, /start_period: 10m/)
  assert.match(compose, /pull_policy: always/)
  assert.match(compose, /AGENT_OS_INPUT_COST_MICROS_PER_MILLION: \$\{AGENT_OS_INPUT_COST_MICROS_PER_MILLION:\?/)
  assert.match(compose, /lingxios-homes:\/var\/lib\/lingxios\/homes/)
  assert.match(compose, /security_opt: \["seccomp=unconfined", "systempaths=unconfined"\]/)
  assert.match(compose, /pids_limit: 128/)
  const image = await readFile(new URL('../../docker/lingxiloop-server.Dockerfile', import.meta.url), 'utf8')
  assert.match(image, /node:22-bookworm-slim/)
  assert.match(image, /python3[\s\\]+bubblewrap/)
})

test('the authenticated product router owns the LingxiOS control surface', async () => {
  const router = await readFile(new URL('../im/router.ts', import.meta.url), 'utf8')
  for (const route of [
    "get('/approvals/:id'",
    "post('/approvals/:id/resolve'",
    "post('/approvals/:id/reconcile'",
    "get('/channels/:id/agents/:agentId/runs/:runId'",
    "delete('/channels/:id/agents/:agentId/runs/:runId'",
  ]) assert.ok(router.includes(route))
  assert.match(router, /await identity\(req\)/)
  assert.match(router, /action: 'agent_run:control'/)
})

test('Open Notebook restarts only after SurrealDB is healthy', async () => {
  const compose = await readFile(
    new URL('../../../deploy/komodo/lingxiloop-knowledge-agent/compose.yml', import.meta.url),
    'utf8',
  )
  assert.match(compose, /depends_on:\r?\n {6}surrealdb:\r?\n {8}condition: service_healthy\r?\n {8}restart: true/)
})



test('database pool does not load unrelated application secrets', async () => {
  const pool = await readFile(new URL('../db/pool.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(pool, /from ['"]\.\.\/env\.js['"]/)
})
