import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { openGateway } from './gateway.mjs'

const compare = fileURLToPath(new URL('./compare.py', import.meta.url))
const [mode, outputArg] = process.argv.slice(2)
assert.ok(['--smoke', '--live'].includes(mode) && outputArg, 'Usage: node run.mjs --smoke|--live OUTPUT.json')
const live = mode === '--live'
const key = live ? process.env.DEEPSEEK_API_KEY?.trim() : undefined
if (live) {
  assert.ok(key, 'DEEPSEEK_API_KEY is required for live evaluation')
  const locks = new URL('./node_modules/.package-lock.json', import.meta.url)
  const lock = JSON.parse(await readFile(locks, 'utf8'))
  const exact = lock.packages['node_modules/@lingxi-org/lingxios']
  assert.ok(exact?.version === '4.0.0' && exact.integrity === 'sha1-iui7Npfsd+TwQUlFGjlctX2e3bg='
    && /^https:\/\/npm\.pkg\.github\.com\//.test(exact.resolved),
    'Live evaluation requires the published GitHub Packages build of LingxiOS 4.0.0')
}
const { openDatabase, openDeepSeek, openLingxiOS } = await import('./runtimes.mjs')
const output = resolve(outputArg)
const manifest = JSON.parse(execFileSync('python3', [compare, 'manifest'], { encoding: 'utf8' }))
const { protocolSha256, runtimes, model } = manifest
const tasks = new Map(manifest.tasks.map(task => [task.id, task]))
const interrupted = new AbortController()
process.once('SIGINT', () => interrupted.abort())
process.once('SIGTERM', () => interrupted.abort())

function fixtureFor(task) {
  const child = spawn('python3', [compare, 'fixture', task.id], { stdio: ['pipe', 'pipe', 'inherit'] })
  const exited = once(child, 'exit')
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const executed = []
  let queue = Promise.resolve()
  function request(payload) {
    const execution = queue.then(async () => {
      child.stdin.write(JSON.stringify(payload) + '\n')
      const line = await lines.next()
      assert.ok(!line.done, 'Fixture closed without responding')
      return JSON.parse(line.value)
    })
    queue = execution.catch(() => {})
    return execution
  }
  async function finish() {
    await queue
    child.stdin.end()
    const line = await lines.next()
    const [code] = await exited
    assert.equal(code, 0)
    return JSON.parse(line.value).finalState
  }
  return {
    async executeTool(tool, args) {
      if (executed.length >= manifest.maxToolAttempts) return { outcome: 'budget-exceeded' }
      const result = await request({ tool, args })
      executed.push({ tool, args, outcome: result.outcome })
      return result
    },
    inspect: () => request({ inspect: true }),
    finish, executed,
  }
}

async function sample(id, repeat, runtime, pool) {
  const task = tasks.get(id)
  const tools = manifest.tools.filter(tool => task.allowedTools.includes(tool.name))
  const fixture = fixtureFor(task)
  const gateway = await openGateway({ manifest, task, tools, executeTool: fixture.executeTool, key })
  const root = await mkdtemp(join(tmpdir(), 'harness-sample-'))
  let target, finalState
  const cancel = new AbortController()
  const identity = randomUUID()
  try {
    const options = { pool, root, manifest, task, tools, executeTool: fixture.executeTool, inspect: fixture.inspect,
      baseUrl: gateway.baseUrl, fixtureUrl: gateway.fixtureUrl, identity }
    target = runtime === 'lingxios' ? await openLingxiOS(options) : await openDeepSeek(options)
    const deadline = AbortSignal.any([AbortSignal.timeout(manifest.timeoutMs), interrupted.signal, cancel.signal])
    const started = performance.now()
    gateway.start(deadline)
    let result
    let stopWaiting
    try {
      result = await Promise.race([target.run(task.prompt), new Promise((_, reject) => {
        stopWaiting = () => reject(deadline.reason)
        deadline.addEventListener('abort', stopWaiting, { once: true })
      })])
    } catch (error) {
      result = { answer: '', status: deadline.aborted || error.code === 'timeout' ? 'timeout' : 'runtime-error',
        runtimeStatus: live ? error.name : error.message }
    } finally {
      if (stopWaiting) deadline.removeEventListener('abort', stopWaiting)
    }
    const latencyMs = Math.round(performance.now() - started)
    cancel.abort()
    await target.stop()
    target = null
    await gateway.stop()
    finalState = await fixture.finish()
    const pending = [...fixture.executed]
    const toolAttempts = gateway.attempts.map(call => {
      const match = pending.findIndex(item => item.tool === call.tool && isDeepStrictEqual(item.args, call.args))
      if (match >= 0) return pending.splice(match, 1)[0]
      return { ...call, outcome: tools.some(tool => tool.name === call.tool) ? 'invalid' : 'denied' }
    })
    assert.equal(pending.length, 0, 'Fixture executions without matching provider call')
    return { task: id, repeat, runtime, ...result,
      status: gateway.exceeded && result.status !== 'timeout' ? 'budget-exceeded' : result.status,
      latencyMs, finalState, toolAttempts, providerUsage: gateway.providerUsage,
      catalogs: gateway.catalogs, gatewayFailures: gateway.failures, blockedStatus: gateway.blockedStatus }
  } finally {
    cancel.abort()
    try {
      await target?.stop()
    } finally {
      await gateway.stop()
      if (!finalState) await fixture.finish().catch(() => {})
      await rm(root, { recursive: true, force: true })
    }
  }
}

await mkdir(dirname(output), { recursive: true })
const journal = output + '.jsonl'
const provenance = { protocolSha256, runtimes, model, mode: live ? 'live' : 'smoke' }
await writeFile(journal, JSON.stringify(provenance) + '\n', { flag: 'wx', mode: 0o600 })
const pool = await openDatabase()
const rows = []
try {
  const schedule = manifest.runOrder
  for (const [id, repeat, runtime] of schedule) {
    interrupted.signal.throwIfAborted()
    await appendFile(journal, JSON.stringify({ started: { task: id, repeat, runtime } }) + '\n')
    const row = await sample(id, repeat, runtime, pool)
    rows.push(row)
    await appendFile(journal, JSON.stringify(row) + '\n')
    console.log(`${rows.length}/${schedule.length} ${runtime} ${id} ${row.status} ${row.latencyMs}ms`)
    if (row.blockedStatus) throw new Error(`Provider declined authentication or billing (HTTP ${row.blockedStatus})`)
    if (live && !row.providerUsage.length && row.gatewayFailures.length) throw new Error('Shared gateway rejected the runtime request')
    if (!live) {
      const task = tasks.get(id)
      assert.equal(row.status, 'completed', JSON.stringify(row))
      assert.equal(row.answer.trim(), task.expectedAnswer)
      assert.ok(isDeepStrictEqual(row.finalState, task.expectedState), JSON.stringify(row))
      assert.ok(isDeepStrictEqual(row.toolAttempts, task.expectedCalls), JSON.stringify(row))
      assert.equal(row.providerUsage.length, task.expectedCalls.length + 1)
      assert.ok(row.providerUsage.every(Boolean))
    }
  }
  await writeFile(output, JSON.stringify({ ...provenance, rows }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
} finally {
  await pool.end()
}
