// Isolated release experiment: Node --import tsx scripts/benchmark-distributed-runtime.mjs OUTPUT.json
// Requires disposable PostgreSQL/Redis/MinIO, the published baseline package, and a Linux SDK worker image.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const quiet = { debug() {}, info() {}, warn() {}, error() {}, child() { return this } }
const quantiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return { count: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null,
    p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null }
}
const loadPackage = (directory, suffix = '') => directory
  ? import(pathToFileURL(join(directory, suffix ? 'benchmark-worker.mjs' : 'benchmark-runtime.mjs')).href)
  : import(`@lyyzka/lingxios${suffix}`)
async function command(args) {
  const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', data => { output += data }); child.stderr.on('data', data => { output += data })
  const [code] = await once(child, 'exit')
  assert.equal(code, 0, output)
  return output.trim()
}
async function wait(check, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs
  while (!await check()) { assert.ok(Date.now() < end, 'benchmark condition timed out'); await delay(50) }
}

async function runWorker() {
  // Observe the published baseline's clock-regression failure without altering its behavior.
  let clockFailures = []
  const fetchRequest = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const response = await fetchRequest(input, init)
    if (!response.ok && typeof init?.body === 'string') {
      const observation = JSON.parse(init.body).observation
      if (observation?.latencyMs < 0) clockFailures.push({ workId: observation.workId, latencyMs: observation.latencyMs })
    }
    return response
  }
  const directory = process.env.LINGXIOS_PACKAGE_DIRECTORY
  const { MetricsRegistry } = await loadPackage(directory)
  const { createWorker } = await loadPackage(directory, '/worker')
  const metrics = new MetricsRegistry(), wrapped = new Set()
  let samples = {}, uploadedBytes = 0, baseline = process.cpuUsage(), peakRss = 0
  const histogram = metrics.histogram.bind(metrics), counter = metrics.counter.bind(metrics)
  metrics.histogram = (name, ...args) => {
    const metric = histogram(name, ...args)
    if (name.startsWith('agentos_workspace_') && !wrapped.has(name)) {
      wrapped.add(name); const observe = metric.observe.bind(metric)
      metric.observe = (value, labels) => { (samples[name] ??= []).push(value * 1000); observe(value, labels) }
    }
    return metric
  }
  metrics.counter = (name, ...args) => {
    const metric = counter(name, ...args)
    if (name === 'agentos_workspace_uploaded_bytes_total' && !wrapped.has(name)) {
      wrapped.add(name); const inc = metric.inc.bind(metric)
      metric.inc = (labels, value = 1) => { uploadedBytes += value; inc(labels, value) }
    }
    return metric
  }
  const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 50)
  const telemetry = createServer((req, res) => {
    if (req.method === 'POST') { samples = {}; clockFailures = []; uploadedBytes = 0; baseline = process.cpuUsage(); peakRss = process.memoryUsage().rss }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ samples, clockFailures, uploadedBytes, cpuMicroseconds: process.cpuUsage(baseline), peakNodeRssBytes: peakRss }))
  })
  telemetry.listen(5191, '0.0.0.0'); await once(telemetry, 'listening')
  const worker = createWorker({ controlPlane: { url: process.env.BENCH_CONTROL_URL, serviceToken: 'isolated-benchmark' },
    model: { id: 'fixed-stub', apiKey: 'unused', baseUrl: process.env.BENCH_MODEL_URL, contextWindowTokens: 128000, maxOutputTokens: 1024 },
    modelBudget: { maxModelCalls: 8, maxTokens: 100000, maxCostMicros: 1000000, wallClockMs: 120000,
      inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    resources: { model: Number(process.env.BENCH_CONCURRENCY), python: 1 },
    performance: { checkpointDedup: true, promptCache: true, asyncCompaction: true, onDemandAttachments: true },
    worker: { id: process.env.BENCH_WORKER_ID, concurrency: Number(process.env.BENCH_CONCURRENCY),
      reservedInteractiveRuns: Number(process.env.BENCH_RESERVED), healthPort: 5190, pollIdleMs: 750, shutdownGraceMs: 10000 },
    kernel: { homesRoot: '/data/homes', isolation: 'bubblewrap' }, metrics, logger: quiet })
  await worker.start()
  const stop = async () => { await worker.stop(); clearInterval(sample); telemetry.closeAllConnections(); telemetry.close() }
  process.once('SIGTERM', () => { void stop() }); process.once('SIGINT', () => { void stop() })
}

async function runBenchmark() {
  const baselineDirectory = resolve(process.env.LINGXIOS_BASELINE_DIRECTORY ?? '')
  const image = process.env.LINGXIOS_BENCH_WORKER_IMAGE
  const seccomp = process.env.LINGXIOS_BENCH_SECCOMP_FILE
  assert.ok(image && seccomp && process.env.LINGXIOS_BASELINE_DIRECTORY, 'configure baseline package directory, SDK seccomp file and Linux worker image')
  for (const name of ['LINGXIOS_BENCH_DATABASE_URL', 'LINGXIOS_TEST_REDIS_URL', 'R2_ENDPOINT']) {
    assert.equal(new URL(process.env[name]).hostname, '127.0.0.1', `${name} must be a disposable local service`)
  }
  const { Pool } = await import('pg')
  const { createRealtimeStore } = await import('../server/src/agent-runtime/realtime-store.ts')
  const { createRuntimeObjectStore } = await import('../server/src/agent-runtime/object-store.ts')
  // Resolve both historical entrypoints through their package exports, including their import condition.
  for (const [file, suffix] of [['benchmark-runtime.mjs', ''], ['benchmark-worker.mjs', '/worker']]) {
    await writeFile(join(baselineDirectory, file), `export * from '@lyyzka/lingxios${suffix}'\n`)
  }
  const baselineSdk = await loadPackage(baselineDirectory), sdk = await import('@lyyzka/lingxios')
  assert.equal(baselineSdk.releaseVersions.runtime, '3.2.13'); assert.equal(sdk.releaseVersions.runtime, '3.3.0')
  const databaseUrl = new URL(process.env.LINGXIOS_BENCH_DATABASE_URL)
  const admin = new Pool({ connectionString: databaseUrl.href, max: 1 })
  const results = [], script = fileURLToPath(import.meta.url)
  const security = JSON.parse(await command(['info', '--format', '{{json .SecurityOptions}}']))
  const apparmor = security.some(value => value.split(',').includes('name=apparmor'))
  try {
    for (const config of [{ name: 'original-single', checkpoints: false, workers: 1 },
      { name: 'checkpoint-single', checkpoints: true, workers: 1 }, { name: 'checkpoint-dual', checkpoints: true, workers: 2 }]) {
      const packageApi = config.checkpoints ? sdk : baselineSdk, id = randomUUID().replaceAll('-', '')
      const databaseName = `runtime_bench_${id}`
      await admin.query(`CREATE DATABASE ${databaseName}`)
      const target = new URL(databaseUrl); target.pathname = `/${databaseName}`
      const pool = new Pool({ connectionString: target.href, max: 16 }), apps = [], controlPorts = [], stores = [], workers = [], rows = new Map()
      const homesRoot = await mkdtemp(join(tmpdir(), 'lingxios-benchmark-'))
      let stub, measuring = false, dockerSamples = [], sampling = false
      const model = createServer(async (req, res) => {
        try {
          const chunks = []; for await (const chunk of req) chunks.push(chunk)
          const input = JSON.parse(Buffer.concat(chunks).toString())
          const key = [...JSON.stringify(input.messages).matchAll(/BENCH:([a-z0-9-]+)/g)].at(-1)?.[1], row = rows.get(key)
          if (!input.stream) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ model: 'fixed-stub', choices: [{ message: { content: '{"missing":[]}' }, finish_reason: 'stop' }] })); return }
          assert.ok(row, 'stub request lost its run marker')
          const hop = ++row.hops
          await delay(120)
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          const send = delta => res.write(`data: ${JSON.stringify({ model: 'fixed-stub', choices: [{ index: 0, delta }] })}\n\n`)
          if (hop <= (row.restore ? 1 : 2)) {
            const code = row.restore ? 'import os; assert not os.path.exists("delete.txt"); assert open("answer.txt","rb").read()==b"x"*1048576; print("restored")'
              : hop === 1 ? 'import os; os.mkdir("nested"); open("answer.txt","wb").write(b"x"*1048576); open("delete.txt","w").write("old")'
                : 'import os; os.unlink("delete.txt"); open("nested/final.txt","w").write("done"); attach_file("nested/final.txt")'
            send({ tool_calls: [{ index: 0, id: `cell-${hop}`, type: 'function', function: { name: 'ipython', arguments: JSON.stringify({ code }) } }] })
          } else {
            row.providerAt = performance.now()
            const content = JSON.stringify({ body: 'Done.', status: 'satisfied',
              checks: [{ requirement: 'Reply Done.', status: 'met', basis: 'Python completed and the requested result is available.' }], gaps: [] })
            send({ content: '{"body":"Do' }); await delay(120); send({ content: content.slice('{"body":"Do'.length) })
          }
          res.end(`data: ${JSON.stringify({ model: 'fixed-stub', choices: [{ index: 0, delta: {}, finish_reason: hop <= (row.restore ? 1 : 2) ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
        } catch (error) { res.destroy(error) }
      })
      const telemetry = async worker => (await fetch(`http://127.0.0.1:${worker.port}/`)).json()
      const stopWorker = async worker => { await command(['stop', '--time', '15', worker.name]) }
      const launchWorker = async (index, controlPort) => {
        const name = `runtime-bench-${id}-${index}`, concurrency = index === 0 ? 2 : 1
        await command(['run', '-d', '--name', name, '--read-only', '--cpus', index === 0 ? '.75' : '.5', '--memory', '512m',
          '--pids-limit', '128', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
          '--security-opt', `seccomp=${resolve(seccomp)}`,
          ...apparmor ? ['--security-opt', 'apparmor=lingxios-worker'] : [],
          '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m', '--tmpfs', '/data/homes:rw,nosuid,size=256m,uid=1000,gid=1000',
          '-p', '127.0.0.1::5191', '-v', `${script}:/app/bench.mjs:ro`, '-v', `${baselineDirectory}:/baseline:ro`,
          '-e', `LINGXIOS_PACKAGE_DIRECTORY=${config.checkpoints ? '' : '/baseline'}`,
          '-e', `BENCH_CONTROL_URL=http://host.docker.internal:${controlPort}`, '-e', `BENCH_MODEL_URL=http://host.docker.internal:${stub}`,
          '-e', `BENCH_WORKER_ID=${name}`, '-e', `BENCH_CONCURRENCY=${concurrency}`, '-e', `BENCH_RESERVED=${index === 0 ? 1 : 0}`,
          image, 'node', '/app/bench.mjs', '--worker'])
        const port = Number((await command(['port', name, '5191/tcp'])).split(':').at(-1)), worker = { name, port }
        workers.push(worker)
        await wait(async () => { try { return (await fetch(`http://127.0.0.1:${port}/`)).ok } catch { return false } })
        return worker
      }
      const execute = async (key, index, restore = false, sessionId = key) => {
        const row = { key, hops: 0, restore, began: performance.now() }; rows.set(key, row)
        const identity = { runId: key, tenantId: 'benchmark', agentId: 'agent', principalId: 'human', sessionId }
        await apps[0].enqueue({ ...identity, id: key, executionClass: 'operation', codeExecution: 'enabled',
          text: `BENCH:${key} ${restore ? 'Verify the recovered directory.' : 'Write the requested files, delete delete.txt, and attach nested/final.txt.'} Reply Done.` })
        const response = await apps[index % apps.length].streamRun(identity, { signal: AbortSignal.timeout(120000) })
        let tail = ''
        for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
          tail += chunk
          const frames = tail.split('\n\n'); tail = frames.pop()
          for (const frame of frames) {
            const data = frame.split('\n').find(line => line.startsWith('data: '))
            if (!data || !frame.includes('event: preview')) continue
            const value = JSON.parse(data.slice(6))
            if ((value.preview.draft ?? value.preview.delta) && row.firstAt === undefined) row.firstAt = performance.now()
          }
        }
        row.finished = performance.now()
        const run = await apps[0].readRun(identity)
        if (!config.checkpoints && run.status !== 'succeeded') {
          const clockFailure = (await telemetry(workers[0])).clockFailures.find(item => item.workId === key)
          assert.ok(clockFailure, JSON.stringify(run))
          return Object.assign(row, { failed: true, clockFailure, totalMs: row.finished - row.began })
        }
        assert.equal(run.status, 'succeeded', JSON.stringify(run))
        assert.ok(row.firstAt, 'first body must arrive through SSE')
        if (!restore) assert.equal(Buffer.from((await apps.at(-1).readArtifact(identity, 'nested/final.txt')).bytes).toString(), 'done')
        const state = (await pool.query('SELECT EXTRACT(EPOCH FROM (started_at-created_at))*1000 AS queue_ms,leased_by FROM lingxios.agent_work_items WHERE id=$1', [key])).rows[0]
        Object.assign(row, { queueMs: Number(state.queue_ms), worker: state.leased_by, ttftMs: row.firstAt - row.began,
          forwardingMs: row.firstAt - row.providerAt, totalMs: row.finished - row.began })
        return row
      }
      try {
        await pool.query(await readFile(packageApi.packageResources().schema, 'utf8'))
        model.listen(0, '0.0.0.0'); await once(model, 'listening'); stub = model.address().port
        for (let index = 0; index < config.workers; index++) {
          const store = config.checkpoints ? createRealtimeStore(process.env.LINGXIOS_TEST_REDIS_URL) : null
          const objects = config.checkpoints ? createRuntimeObjectStore(process.env.LINGXIOS_R2_BUCKET) : null
          stores.push(store, objects)
          const app = await packageApi.createLingxiOS({ database: pool, homesRoot, logger: quiet,
            performance: { notifications: true, contextSnapshot: true, outboxConcurrency: 4 },
            realtime: { allowDraft: () => true, ...store ? { store } : {} }, ...objects ? { objects, workspace: {} } : {} })
          apps.push(app)
          const port = await app.listenControlPlane({ host: '0.0.0.0', port: 0, serviceToken: 'isolated-benchmark' })
          controlPorts.push(port)
          await launchWorker(index, port)
        }
        for (let index = 0, passed = 0; passed < 4; index++) {
          assert.ok(index < 12, 'baseline warmup repeatedly failed')
          if (!(await execute(`warm-${id}-${index}`, index)).failed) passed++
        }
        for (const worker of workers) await fetch(`http://127.0.0.1:${worker.port}/`, { method: 'POST' })
        const beforeSql = apps.map(app => app.metrics()), cpu = process.cpuUsage(), began = performance.now()
        measuring = true
        const sample = async () => {
          if (sampling) return
          sampling = true
          try { dockerSamples.push(await command(['stats', '--no-stream', '--format', '{{json .}}', ...workers.map(worker => worker.name)])) }
          finally { sampling = false }
        }
        const timer = setInterval(() => { if (measuring) void sample() }, 2000)
        const measured = []
        try {
          for (let batch = 0; measured.filter(row => !row.failed).length < 30; batch++) {
            assert.ok(batch < 10, 'too many failed benchmark requests')
            measured.push(...await Promise.all(Array.from({ length: 6 }, (_, offset) => execute(`run-${id}-${batch * 6 + offset}`, offset))))
          }
        }
        finally { measuring = false; clearInterval(timer); await wait(() => !sampling) }
        const elapsedMs = Math.max(...measured.map(row => row.finished)) - began, workerMetrics = await Promise.all(workers.map(telemetry))
        const queryCount = text => [...text.matchAll(/^agentos_database_queries_total[^\n]* (\d+)$/gm)].reduce((sum, match) => sum + Number(match[1]), 0)
        const succeeded = measured.filter(row => !row.failed)
        const summary = { ...config, repetitions: measured.length, successful: succeeded.length, failed: measured.length - succeeded.length,
          elapsedMs, throughputPerSecond: succeeded.length * 1000 / elapsedMs,
          ttftMs: quantiles(measured.map(row => row.ttftMs)), forwardingMs: quantiles(measured.map(row => row.forwardingMs)),
          queueMs: quantiles(measured.map(row => row.queueMs)), controlCpuMicroseconds: process.cpuUsage(cpu),
          sqlStatements: apps.reduce((sum, app, i) => sum + queryCount(app.metrics()) - queryCount(beforeSql[i]), 0),
          checkpointMs: quantiles(workerMetrics.flatMap(metric => metric.samples.agentos_workspace_checkpoint_seconds ?? [])),
          uploadedBytes: workerMetrics.reduce((sum, metric) => sum + metric.uploadedBytes, 0), workerMetrics, dockerSamples, measured }
        assert.equal(new Set(succeeded.map(row => row.worker)).size, config.workers)
        if (config.checkpoints) {
          for (const worker of workers) await stopWorker(worker)
          const replacement = await launchWorker(2, controlPorts[0])
          await fetch(`http://127.0.0.1:${replacement.port}/`, { method: 'POST' })
          summary.recovery = await execute(`restore-${id}`, 0, true, measured[0].key)
          summary.restoreMs = quantiles((await telemetry(replacement)).samples.agentos_workspace_restore_seconds ?? [])
          assert.ok(summary.recovery.hops >= 2 && summary.restoreMs.count > 0, 'recovery must execute Python after restoring the prior directory')
        }
        results.push(summary)
        await writeFile(process.argv[2], JSON.stringify({ complete: false, results }, null, 2))
        console.log(JSON.stringify({ configuration: config.name, ttftMs: summary.ttftMs, throughputPerSecond: summary.throughputPerSecond, checkpointMs: summary.checkpointMs }))
      } catch (error) {
        for (const worker of workers) console.error(await command(['logs', '--tail', '30', worker.name]))
        throw error
      } finally {
        measuring = false
        for (const worker of workers) await command(['rm', '-f', worker.name])
        for (const app of apps) await app.stop()
        for (const store of stores) store?.close()
        model.closeAllConnections(); if (model.listening) await new Promise(resolve => model.close(resolve))
        await pool.end()
      }
    }
    await writeFile(process.argv[2], JSON.stringify({ complete: true, measuredAt: new Date().toISOString(), stub: '120ms per model hop, 1MiB file plus a deletion and a four-byte artifact, six-request backlog',
      workerLimits: 'B: .75 CPU, 512MiB, 2 slots/1 reserved; A: .5 CPU, 512MiB, 1 slot/0 reserved; Python 1 each; production performance options and 750ms idle polling', results }, null, 2))
  } finally { await admin.end() }
}

if (process.argv.includes('--worker')) await runWorker()
else await runBenchmark()
