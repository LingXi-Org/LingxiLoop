#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const suffix = randomBytes(5).toString('hex')
const prefix = `lingxiloop-smoke-${suffix}`
const image = `${prefix}:test`
const container = prefix
const volumes = ['home', 'workspace', 'documents', 'downloads'].map((name) => `${prefix}-${name}`)
if (!container.startsWith('lingxiloop-smoke-') || volumes.some((volume) => !volume.startsWith(`${container}-`))) {
  throw new Error('unsafe smoke cleanup target')
}

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
runuser -u smoke_a -- Xvfb :11 -screen 0 320x240x24 -nolisten tcp >/tmp/smoke-a-x.log 2>&1 &
runuser -u smoke_b -- Xvfb :12 -screen 0 320x240x24 -nolisten tcp >/tmp/smoke-b-x.log 2>&1 &
sleep 1
runuser -u smoke_a -- env DISPLAY=:11 xterm -bg '#cc2222' -fg white -geometry 30x10+5+5 -e sh -c 'sleep 60' >/tmp/smoke-a-term.log 2>&1 &
runuser -u smoke_b -- env DISPLAY=:12 xterm -bg '#2244cc' -fg white -geometry 30x10+5+5 -e sh -c 'sleep 60' >/tmp/smoke-b-term.log 2>&1 &
sleep 1
scrot --display :11 /tmp/smoke-a.png
scrot --display :12 /tmp/smoke-b.png
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

  process.stdout.write('user-computer Docker/browser smoke passed\n')
} catch (error) {
  const logs = run(['logs', container], { allowFailure: true })
  const chromium = exec(['sh', '-lc', 'test -f /tmp/chromium-broker.log && cat /tmp/chromium-broker.log || true'], { allowFailure: true })
  throw new Error(`${error instanceof Error ? error.message : String(error)}\ncontainer logs:\n${logs.stdout}\n${logs.stderr}\nchromium logs:\n${chromium.stdout}\n${chromium.stderr}`)
} finally {
  run(['rm', '--force', container], { allowFailure: true })
  for (const volume of volumes) {
    run(['volume', 'rm', volume], { allowFailure: true })
  }
  run(['image', 'rm', image], { allowFailure: true })
}
