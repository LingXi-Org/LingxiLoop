#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const suffix = randomBytes(5).toString('hex')
const prefix = `lingxiloop-smoke-${suffix}`
const image = `${prefix}:test`
const container = prefix
const volumes = ['home', 'workspace', 'documents', 'downloads'].map((name) => `${prefix}-${name}`)
const databaseUrl = process.env.DATABASE_URL ?? ''
if (!container.startsWith('lingxiloop-smoke-') || volumes.some((volume) => !volume.startsWith(`${container}-`))) {
  throw new Error('unsafe smoke cleanup target')
}
if (!/test/i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must point to a disposable test database for the full-stack computer smoke')
}
process.env.LINGXILOOP_USER_COMPUTER_IMAGE = image
process.env.OPENAI_API_KEY ||= 'computer-smoke-key'
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379'

let apiServer
let resetDatabase
let teardownDatabase

function run(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: options.timeout ?? 180_000 })
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed (${result.status})\n${result.stdout}\n${result.stderr}`)
  }
  return result
}

function exec(args, options) {
  return run(['exec', container, ...args], options)
}

function execAs(user, args, options) {
  return run(['exec', '--user', user, container, ...args], options)
}

function broker(endpoint, payload) {
  const result = exec([
    'curl', '--fail', '--silent', '--show-error', '--unix-socket', '/run/lingxi/browser.sock',
    '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', JSON.stringify(payload),
    `http://localhost${endpoint}`,
  ])
  return JSON.parse(result.stdout)
}

async function waitForBroker() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = exec([
      'curl', '--fail', '--silent', '--unix-socket', '/run/lingxi/browser.sock',
      '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '{}',
      'http://localhost/health',
    ], { allowFailure: true })
    if (result.status === 0) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('browser broker did not become ready')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

async function apiJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  if (response.status !== (options.status ?? 200)) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

try {
  run(['build', '-f', 'server/docker/user-computer.Dockerfile', '-t', image, '.'], { timeout: 900_000 })
  run([
    'create', '--name', container, '--shm-size', '1g',
    '-v', `${volumes[0]}:/home/lingxi`,
    '-v', `${volumes[1]}:/workspace`,
    '-v', `${volumes[2]}:/documents`,
    '-v', `${volumes[3]}:/downloads`,
    image,
  ])
  run(['start', container])
  await waitForBroker()
  broker('/health', {})

  exec(['sh', '-lc', `
for user in smoke_a smoke_b; do
  id "$user" >/dev/null 2>&1 || useradd --no-create-home --home-dir "/home/lingxi/agent-private/$user" --shell /bin/bash --groups lingxi-shared "$user"
  mkdir -p "/home/lingxi/agent-private/$user"
  chown "$user:lingxi-shared" "/home/lingxi/agent-private/$user"
  chmod 700 "/home/lingxi/agent-private/$user"
done
runuser -u smoke_a -- Xvfb :21 -screen 0 320x240x24 -nolisten tcp >/tmp/smoke-a-x.log 2>&1 &
runuser -u smoke_b -- Xvfb :22 -screen 0 320x240x24 -nolisten tcp >/tmp/smoke-b-x.log 2>&1 &
sleep 1
runuser -u smoke_a -- env DISPLAY=:21 xterm -bg '#cc2222' -fg white -geometry 30x10+5+5 -e sh -c 'sleep 60' >/tmp/smoke-a-term.log 2>&1 &
runuser -u smoke_b -- env DISPLAY=:22 xterm -bg '#2244cc' -fg white -geometry 30x10+5+5 -e sh -c 'sleep 60' >/tmp/smoke-b-term.log 2>&1 &
sleep 1
scrot --display :21 /tmp/smoke-a.png
scrot --display :22 /tmp/smoke-b.png
test "$(sha256sum /tmp/smoke-a.png | cut -d' ' -f1)" != "$(sha256sum /tmp/smoke-b.png | cut -d' ' -f1)"
`])

  execAs('smoke_a', ['sh', '-lc', 'printf shared-from-a > /workspace/shared.txt; printf private-a > /home/lingxi/agent-private/smoke_a/private.txt'])
  assert(execAs('smoke_b', ['cat', '/workspace/shared.txt']).stdout === 'shared-from-a', 'shared workspace is not readable across agents')
  assert(execAs('smoke_b', ['cat', '/home/lingxi/agent-private/smoke_a/private.txt'], { allowFailure: true }).status !== 0,
    'agent B could read agent A private home')
  assert(execAs('smoke_a', ['curl', '--unix-socket', '/run/lingxi/browser.sock', 'http://localhost/health'], { allowFailure: true }).status !== 0,
    'agent shell could bypass the root-only browser broker')

  exec(['sh', '-lc', `printf '<button style="width:120px;height:80px" onclick="localStorage.clicks=String(+(localStorage.clicks||0)+1)">click</button>' > /workspace/index.html`])
  run(['exec', '-d', '--user', 'lingxi', container, 'python3', '-m', 'http.server', '8080', '--directory', '/workspace'])
  const first = broker('/targets/create', { url: 'http://127.0.0.1:8080/' })
  assert(typeof first.id === 'string', 'browser target was not created')
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  broker('/targets/evaluate', { targetId: first.id, expression: `localStorage.setItem('sharedLogin','persisted')` })
  broker('/targets/input', { targetId: first.id, type: 'click', x: 40, y: 30 })
  const clickValue = broker('/targets/evaluate', { targetId: first.id, expression: `localStorage.getItem('clicks')` })
  assert(clickValue.result?.value === '1', 'CDP input did not mutate the exact target state')
  const second = broker('/targets/create', { url: 'http://127.0.0.1:8080/' })
  await new Promise((resolve) => setTimeout(resolve, 750))
  const shared = broker('/targets/evaluate', { targetId: second.id, expression: `localStorage.getItem('sharedLogin')` })
  assert(shared.result?.value === 'persisted', 'singleton browser profile was not shared across targets')

  exec(['sh', '-lc', 'printf home > /home/lingxi/home.marker; printf workspace > /workspace/workspace.marker; printf documents > /documents/documents.marker; printf downloads > /downloads/downloads.marker'])
  broker('/shutdown', {})
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  run(['restart', '--time', '10', container], { timeout: 180_000 })
  await waitForBroker()
  broker('/health', {})
  exec(['sh', '-lc', 'test -f /home/lingxi/home.marker && test -f /workspace/workspace.marker && test -f /documents/documents.marker && test -f /downloads/downloads.marker'])
  run(['exec', '-d', '--user', 'lingxi', container, 'python3', '-m', 'http.server', '8080', '--directory', '/workspace'])
  const afterRestart = broker('/targets/create', { url: 'http://127.0.0.1:8080/' })
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  const persisted = broker('/targets/evaluate', { targetId: afterRestart.id, expression: `localStorage.getItem('sharedLogin')` })
  assert(persisted.result?.value === 'persisted', 'Chromium profile did not persist across restart')

  // Full-stack bridge: the production service and API now own the Screens,
  // browser targets, screenshots, takeover lease, human input and return. The
  // direct broker evaluate calls below are test oracles only; every product
  // mutation travels through UserComputerService or the HTTP API.
  const helpers = await import('../server/src/__integration__/_helpers.js')
  const { pool } = await import('../server/src/db/pool.js')
  const { userComputerService } = await import('../server/src/agents/computer/user-computer.js')
  resetDatabase = helpers.resetAllTables
  teardownDatabase = helpers.teardownAll
  await resetDatabase()

  const companyId = `computer-smoke-company-${suffix}`
  const userId = `computer-smoke-user-${suffix}`
  const agentA = `computer-smoke-agent-a-${suffix}`
  const agentB = `computer-smoke-agent-b-${suffix}`
  await helpers.seedCompanyWithAgent({ companyId, agentId: agentA })
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1,$2,'agent','Smoke Agent B','tester','B','#2244cc','avail')`,
    [agentB, companyId],
  )
  await helpers.seedUserMembership(userId, companyId, { displayName: 'Computer Smoke User' })

  const computer = await userComputerService.ensure(userId, companyId)
  await pool.query(
    `UPDATE user_computers SET runtime_ref = $2, status = 'running', last_active_at = NOW() WHERE id = $1`,
    [computer.id, container],
  )

  const app = await helpers.buildApiTestApp(userId)
  await new Promise((resolve, reject) => {
    apiServer = app.listen(0, '127.0.0.1', resolve)
    apiServer.once('error', reject)
  })
  const address = apiServer.address()
  if (!address || typeof address === 'string') throw new Error('computer smoke API did not bind a TCP port')
  const baseUrl = `http://127.0.0.1:${address.port}/api`

  const screenA = await apiJson(baseUrl, '/computer/screens', {
    method: 'POST', status: 201, body: { agentId: agentA },
  })
  const screenB = await apiJson(baseUrl, '/computer/screens', {
    method: 'POST', status: 201, body: { agentId: agentB },
  })
  assert(screenA.controller?.type === 'agent' && screenA.controller?.id === agentA, 'Screen A did not start under Agent control')
  assert(screenB.controller?.type === 'agent' && screenB.controller?.id === agentB, 'Screen B did not start under Agent control')

  const takeoverPage = `<!doctype html>
<meta charset="utf-8">
<style>
  html,body{margin:0;width:100%;height:100%;background:#eef2ff;font:28px sans-serif}
  main{padding:64px} label{display:block;margin-bottom:18px}
  input{box-sizing:border-box;width:720px;height:86px;padding:14px;border:5px solid #243b80;font:28px monospace}
</style>
<main><label for="editor">Live takeover state</label><input id="editor" autocomplete="off" autofocus></main>
<script>
  const editor = document.querySelector('#editor')
  editor.value = new URLSearchParams(location.search).get('seed') || ''
  editor.addEventListener('input', () => document.body.dataset.value = editor.value)
</script>`
  const encodedPage = Buffer.from(takeoverPage).toString('base64')
  exec(['sh', '-lc', `printf %s '${encodedPage}' | base64 -d > /workspace/takeover.html`])

  const targetA = await userComputerService.openBrowserForAgent({
    companyId, agentId: agentA, screenId: screenA.id,
    url: 'http://127.0.0.1:8080/takeover.html?seed=screen-a',
  })
  const targetB = await userComputerService.openBrowserForAgent({
    companyId, agentId: agentB, screenId: screenB.id,
    url: 'http://127.0.0.1:8080/takeover.html?seed=screen-b',
  })
  await new Promise((resolve) => setTimeout(resolve, 1_000))

  async function apiScreenshot(screenId) {
    const response = await fetch(`${baseUrl}/computer/screens/${screenId}/screenshot`)
    if (!response.ok) throw new Error(`screenshot API returned ${response.status}: ${await response.text()}`)
    return Buffer.from(await response.arrayBuffer())
  }
  function targetValue(targetRef) {
    return broker('/targets/evaluate', {
      targetId: targetRef,
      expression: `document.querySelector('#editor')?.value`,
    }).result?.value
  }

  const initialA = await apiScreenshot(screenA.id)
  const initialB = await apiScreenshot(screenB.id)
  assert(initialA.length > 1_000 && initialA.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])),
    'Screen A API screenshot was not a real PNG')
  assert(initialB.length > 1_000 && sha256(initialA) !== sha256(initialB),
    'Screen screenshots did not resolve their distinct live browser targets')
  assert(targetValue(targetA.targetRef) === 'screen-a' && targetValue(targetB.targetRef) === 'screen-b',
    'browser targets did not load independent initial DOM state')

  const takeover = await apiJson(baseUrl, `/computer/screens/${screenA.id}/takeover`, { method: 'POST' })
  assert(takeover.status === 'human_control' && takeover.controller?.id === userId,
    'Take control did not install the human Screen lease')

  let agentBlocked = false
  try {
    await userComputerService.browserInputForAgent({
      companyId, agentId: agentA, targetId: targetA.id,
      input: { type: 'text', text: '-must-not-run' },
    })
  } catch (error) {
    agentBlocked = /controlled by human/i.test(error instanceof Error ? error.message : String(error))
  }
  assert(agentBlocked, 'the taken-over Screen still accepted Agent GUI input')

  // Screen B remains Agent-controlled and operational while the human owns A.
  await userComputerService.browserInputForAgent({
    companyId, agentId: agentB, targetId: targetB.id,
    input: { type: 'click', x: 760, y: 140 },
  })
  await userComputerService.browserInputForAgent({
    companyId, agentId: agentB, targetId: targetB.id,
    input: { type: 'text', text: '-independent' },
  })
  const duringTakeoverB = await userComputerService.screenStatusForAgent({ companyId, agentId: agentB, screenId: screenB.id })
  assert(duringTakeoverB.controller?.type === 'agent' && duringTakeoverB.controller?.id === agentB,
    `taking over Screen A changed Screen B's controller: ${JSON.stringify(duringTakeoverB.controller)}`)
  const independentBValue = targetValue(targetB.targetRef)
  assert(typeof independentBValue === 'string' && independentBValue.includes('screen-b') && independentBValue.includes('-independent'),
    `Screen B could not continue independently during takeover; value=${JSON.stringify(independentBValue)}`)

  await apiJson(baseUrl, `/computer/screens/${screenA.id}/input`, {
    method: 'POST', body: { type: 'click', x: 760, y: 140, button: 1 },
  })
  await apiJson(baseUrl, `/computer/screens/${screenA.id}/input`, {
    method: 'POST', body: { type: 'text', text: '-human' },
  })
  const humanAValue = targetValue(targetA.targetRef)
  assert(typeof humanAValue === 'string' && humanAValue.includes('screen-a') && humanAValue.includes('-human'),
    `human input did not mutate the exact live target owned by Screen A; value=${JSON.stringify(humanAValue)}`)

  const returned = await apiJson(baseUrl, `/computer/screens/${screenA.id}/return`, { method: 'POST' })
  assert(returned.status === 'working' && returned.controller?.type === 'agent' && returned.controller?.id === agentA,
    'Return to Agent did not restore the Screen A Agent lease')
  await userComputerService.browserInputForAgent({
    companyId, agentId: agentA, targetId: targetA.id,
    input: { type: 'text', text: '-agent' },
  })
  const continuedAValue = targetValue(targetA.targetRef)
  assert(typeof continuedAValue === 'string' && continuedAValue.includes('screen-a') && continuedAValue.includes('-human') && continuedAValue.includes('-agent'),
    `Agent did not continue from the human-mutated live page state; value=${JSON.stringify(continuedAValue)}`)

  const finalA = await apiScreenshot(screenA.id)
  const finalB = await apiScreenshot(screenB.id)
  assert(sha256(finalA) !== sha256(initialA), 'Screen A screenshot did not reflect the continued state')
  assert(targetValue(targetB.targetRef) === independentBValue, 'Screen B state changed after Screen A returned')
  assert(finalB.length > 1_000, 'Screen B stopped producing screenshots during Screen A lifecycle')

  process.stdout.write('user-computer Docker/browser + service/API takeover smoke passed\n')
} catch (error) {
  const logs = run(['logs', container], { allowFailure: true })
  const chromium = exec(['sh', '-lc', 'test -f /tmp/chromium-broker.log && cat /tmp/chromium-broker.log || true'], { allowFailure: true })
  throw new Error(`${error instanceof Error ? error.message : String(error)}\ncontainer logs:\n${logs.stdout}\n${logs.stderr}\nchromium logs:\n${chromium.stdout}\n${chromium.stderr}`)
} finally {
  if (resetDatabase) {
    try { await resetDatabase() } catch { /* disposable smoke DB; continue infrastructure cleanup */ }
  }
  if (teardownDatabase) {
    try { await teardownDatabase(apiServer) } catch { /* continue Docker cleanup */ }
  } else if (apiServer?.listening) {
    await new Promise((resolve) => apiServer.close(resolve))
  }
  run(['rm', '--force', container], { allowFailure: true })
  for (const volume of volumes) {
    run(['volume', 'rm', volume], { allowFailure: true })
  }
  run(['image', 'rm', image], { allowFailure: true })
}
