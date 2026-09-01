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
    'start:fixture',
    'stop:fixture',
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
    'startLearningRoutineScheduler',
    'startLearningEffectWorker',
    'startAgentWorkWatchdog',
    'startMemorySynthesisScheduler',
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
    '../../../docker-compose.production.yml',
  ]) {
    const compose = await readFile(new URL(relative, import.meta.url), 'utf8')
    assert.match(compose, /^ {2}worker:\s*$/m)
    assert.match(compose, /command: \["npm", "run", "worker:start"\]/)
  }
})

test('OpenShip workers inherit the complete runtime environment', async () => {
  const compose = await readFile(
    new URL('../../../deploy/openship/app.yml', import.meta.url),
    'utf8',
  )
  assert.match(compose, /WUKONG_WEBHOOK_SECRET: \$\{WUKONG_WEBHOOK_SECRET:\?/)
  assert.doesNotMatch(compose, /WUKONG_USER_TOKEN_SECRET/)
  assert.match(compose, /lingxiloop:\n    <<: \*runtime\n    environment: \*runtime-environment/)
  assert.match(compose, /worker:\n    <<: \*runtime\n    environment: \*runtime-environment/)
  assert.match(compose, /db-migrate:\n    <<: \*runtime\n    environment:\n      NODE_ENV: production\n      DATABASE_POOL_MAX:[^\n]+\n      DATABASE_URL:/)
  assert.match(compose, /db-migrate:[\s\S]*?restart: on-failure/)
  assert.match(compose, /pull_policy: always/)
})

test('Open Notebook restarts only after SurrealDB is healthy', async () => {
  const compose = await readFile(
    new URL('../../../deploy/openship/knowledge-agent.yml', import.meta.url),
    'utf8',
  )
  assert.match(compose, /depends_on:\n      surrealdb:\n        condition: service_healthy\n        restart: true/)
})

test('database pool does not load unrelated application secrets', async () => {
  const pool = await readFile(new URL('../db/pool.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(pool, /from ['"]\.\.\/env\.js['"]/)
})
