#!/usr/bin/env node
// LingxiLoop production deploy. The same code runs in CI and in any clone whose
// user can read the Sigillo project "LingxiLoop Control Plane" (env prod):
//
//   npm run deploy                          # images → pull → servers + workers
//   npm run deploy -- servers app-a app-b   # one step, optionally some stacks
//   npm run deploy -- plan                 # pull, then show what compose would change
//   npm run deploy -- status
//
// Every key (SSH, Cloudflare, GitHub, npm, each stack's runtime config) comes
// from Sigillo. Outside `sigillo run` the CLI re-executes itself under it; CI
// provides only SIGILLO_TOKEN. Deploys always use the committed HEAD.
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMAGES, imageTag } from '../scripts/image-tag.mjs'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const SIGILLO = ['-p', '01M1TZH9C21C1A9PFAR8E41553', '-c', 'prod']
const REPO = 'LingXi-Org/LingxiLoop'
const HOSTS = { txy2: 'root@182.254.156.84', txy: 'root@111.229.65.23' }
const STACK_HOST = { 'core-state': 'txy2', 'app-a': 'txy2', ingress: 'txy', knowledge: 'txy', 'app-b': 'txy', uptime: 'txy' }
// Stacks in one phase converge in parallel. Slot B moves only after slot A is healthy.
const PHASES = [['core-state', 'ingress', 'knowledge', 'uptime'], ['app-a'], ['app-b']]
const PULL_REGISTRY = 'accel.way2api.fun/ghcr.io/lingxi-org'
const shell = process.platform === 'win32'

async function main(command, requested) {
  const head = git('rev-parse', 'HEAD').trim()
  const images = Object.fromEntries(IMAGES.map(image => [`${image.name.toUpperCase()}_IMAGE`, { ...image, tag: imageTag(image) }]))
  const stacks = selectStacks(requested)
  const ssh = sshSession()
  try {
    const steps = {
      images: () => ensureImages(head, images),
      pull: () => pull(ssh, stacks, images),
      servers: () => servers(ssh, stacks, images),
      workers: () => workers(head),
      status: () => status(ssh),
      plan: async () => { await pull(ssh, stacks, images); await plan(ssh, stacks, images) },
      up: async () => {
        await ensureImages(head, images)
        await pull(ssh, stacks, images)
        await Promise.all([servers(ssh, stacks, images), workers(head)])
      },
    }
    if (!steps[command]) throw new Error(`unknown command ${command}; use up|images|pull|plan|servers|workers|status`)
    await steps[command]()
  } finally { ssh.close() }
}

// Both app slots always move together (see the Worker barrier in servers()).
function selectStacks(requested) {
  for (const stack of requested) if (!STACK_HOST[stack]) throw new Error(`unknown stack ${stack}`)
  const wanted = new Set(requested.length ? requested : Object.keys(STACK_HOST))
  if (wanted.has('app-a') || wanted.has('app-b')) { wanted.add('app-a'); wanted.add('app-b') }
  return PHASES.flat().filter(stack => wanted.has(stack))
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const composeVars = compose => [...new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map(([, name]) => name))]
const stackFiles = stack => git('ls-tree', '-r', '--name-only', 'HEAD', `deploy/${stack}/`).split('\n').filter(Boolean)
  .map(path => [path.slice(`deploy/${stack}/`.length), execFileSync('git', ['show', `HEAD:${path}`])])
const imageRef = image => `${PULL_REGISTRY}/${image.package}:${image.tag}`
const stackImages = (stack, images) => composeVars(git('show', `HEAD:deploy/${stack}/compose.yml`)).filter(name => images[name])

async function ghcrHas(image) {
  const scope = `repository:lingxi-org/${image.package}:pull`
  const { token } = await (await fetch(`https://ghcr.io/token?scope=${scope}`)).json()
  const response = await fetch(`https://ghcr.io/v2/lingxi-org/${image.package}/manifests/${image.tag}`, {
    method: 'HEAD', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json' },
  })
  return response.ok
}

// Images build on GitHub runners (fast to GHCR); a local deploy dispatches that build and waits.
async function ensureImages(head, images) {
  const missing = []
  for (const image of Object.values(images)) if (!(await ghcrHas(image))) missing.push(image.name)
  if (!missing.length) return console.log('images: all present in GHCR')
  if (process.env.GITHUB_ACTIONS) throw new Error(`images missing in GHCR: ${missing.join(', ')}`)
  const github = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init, headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', ...init.headers },
  })
  if (!(await github(`/commits/${head}`)).ok) throw new Error(`HEAD ${head} is not on GitHub; push it first`)
  console.log(`images: building ${missing.join(', ')} on GitHub for ${head.slice(0, 8)}`)
  const since = new Date(Date.now() - 60_000).toISOString()
  const dispatched = await github('/actions/workflows/images.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { sha: head } }) })
  if (!dispatched.ok) throw new Error(`dispatch images.yml: ${dispatched.status} ${await dispatched.text()}`)
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 15_000))
    const { workflow_runs: runs } = await (await github(`/actions/workflows/images.yml/runs?event=workflow_dispatch&created=>${since}`)).json()
    const run = runs?.find(candidate => candidate.display_title === `images ${head}`)
    if (!run || run.status !== 'completed') { console.log(`images: ${run ? `${run.status} ${run.html_url}` : 'waiting for run'}`); continue }
    if (run.conclusion !== 'success') throw new Error(`image build ${run.conclusion}: ${run.html_url}`)
    return console.log('images: built')
  }
}

function sshSession() {
  const dir = mkdtempSync(join(tmpdir(), 'lingxiloop-deploy-'))
  const key = join(dir, 'id')
  writeFileSync(key, `${process.env.DEPLOY_SSH_KEY.replace(/\r\n/g, '\n').trim()}\n`, { mode: 0o600 })
  chmodSync(key, 0o600)
  if (process.platform === 'win32') execFileSync('icacls', [key, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:F`], { stdio: 'ignore' })
  const args = ['-i', key.replaceAll('\\', '/'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'UserKnownHostsFile=deploy/known_hosts',
    '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=20']
  return {
    run: (host, label, script) => new Promise((resolve, reject) => {
      const child = spawn('ssh', [...args, HOSTS[host], 'bash -s'], { stdio: ['pipe', 'pipe', 'pipe'] })
      const prefix = data => process.stdout.write(String(data).replace(/^(?=.)/gm, `[${label}] `))
      child.stdout.on('data', prefix)
      child.stderr.on('data', prefix)
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${label} on ${host} exited ${code}`)))
      child.stdin.end(`set -euo pipefail\n${script}\n`)
    }),
    close: () => rmSync(dir, { recursive: true, force: true }),
  }
}

// ctr pulls from the accelerator directly; Docker's proxied pull measured >10x slower.
async function pull(ssh, stacks, images) {
  const byHost = {}
  for (const stack of stacks) for (const name of stackImages(stack, images)) (byHost[STACK_HOST[stack]] ??= new Set()).add(imageRef(images[name]))
  await Promise.all(Object.entries(byHost).map(([host, refs]) => ssh.run(host, `pull ${host}`, [...refs].map(ref =>
    `docker image inspect ${ref} >/dev/null 2>&1 || { echo "pull ${ref}"; ctr -n moby images pull --platform linux/amd64 ${ref} >/dev/null || ctr -n moby images pull --platform linux/amd64 ${ref} >/dev/null; }`,
  ).join('\n'))))
}

// The stack's .env holds exactly the Sigillo values its compose file references.
function stackEnv(stack, images) {
  const lines = []
  for (const name of composeVars(git('show', `HEAD:deploy/${stack}/compose.yml`))) {
    if (images[name]) continue
    const value = process.env[name]
    if (value === undefined) continue
    if (/['\r\n]/.test(value)) throw new Error(`Sigillo value ${name} must not contain quotes or newlines`)
    lines.push(`${name}='${value}'`)
  }
  return `${lines.join('\n')}\n`
}

// Writes the stack's files beside its host-only state, then converges it. A plan
// writes them to a scratch dir and asks compose what it would change instead.
function convergeScript(stack, images, { dryRun = false } = {}) {
  const imageLines = stackImages(stack, images).map(name => `${name}=${imageRef(images[name])}\n`).join('')
  const files = [...stackFiles(stack), ['.env', Buffer.from(stackEnv(stack, images))], ['images.env', Buffer.from(imageLines)]]
  const compose = 'docker compose --project-directory "$d" -f "$f/compose.yml" --env-file "$f/.env" --env-file "$f/images.env"'
  return [`d=/opt/lingxiloop/${stack}; mkdir -p "$d"; chmod 700 "$d"; umask 077`,
    dryRun ? `f=$(mktemp -d); trap 'rm -rf "$f"' EXIT` : 'f=$d',
    ...files.map(([name, bytes]) => `mkdir -p "$f/$(dirname '${name}')"; base64 -d > "$f/${name}" <<'B64'\n${bytes.toString('base64')}\nB64`),
    dryRun
      ? `${compose} up -d --dry-run 2>&1 | grep -E "Recreate|Creat|Remov|Pull|rror" || echo "no changes"`
      : `${compose} --progress quiet up -d --wait --wait-timeout 900 --remove-orphans\n${compose} ps -a --format '{{.Service}}: {{.Status}}'`,
  ].join('\n')
}

async function plan(ssh, stacks, images) {
  await Promise.all(stacks.map(stack => ssh.run(STACK_HOST[stack], stack, convergeScript(stack, images, { dryRun: true }))))
}

async function servers(ssh, stacks, images) {
  const server = imageRef(images.SERVER_IMAGE)
  // A new Web/API may enqueue effect kinds an old Worker would mishandle, so both
  // old Workers stop (gracefully, up to their 150s drain) before either slot moves.
  const barrier = stacks.includes('app-a') ? Promise.all(['a', 'b'].map(slot => ssh.run(STACK_HOST[`app-${slot}`], `worker ${slot}`,
    `c=lingxiloop-app-${slot}-worker-1; image=$(docker inspect -f '{{.Config.Image}}' $c 2>/dev/null || true)
if [ -n "$image" ] && [ "$image" != '${server}' ]; then echo 'stopping old worker'; docker stop -t 150 $c >/dev/null; fi`))) : Promise.resolve()
  for (const [index, phase] of PHASES.entries()) {
    if (index === 1) await barrier
    await Promise.all(phase.filter(stack => stacks.includes(stack)).map(stack => ssh.run(STACK_HOST[stack], stack, convergeScript(stack, images))))
  }
  await barrier
  for (const url of ['https://backend.lingxilearn.cn/readyz', 'https://loop.lingxilearn.cn/']) {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(error => ({ ok: false, status: error.message }))
      if (response.ok) break
      if (attempt === 10) throw new Error(`${url} answered ${response.status}`)
      await new Promise(resolve => setTimeout(resolve, 3_000))
    }
  }
  console.log('servers: healthy, public probes pass')
}

const run = (label, command, args, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { shell, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  const prefix = data => process.stdout.write(String(data).replace(/^(?=.)/gm, `[${label}] `))
  child.stdout.on('data', prefix)
  child.stderr.on('data', prefix)
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`)))
})

async function workers(head) {
  if (!existsSync('node_modules/wrangler/package.json') || !existsSync('node_modules/vite/package.json')) {
    await run('install', 'node', ['server/scripts/install-scoped-dependencies.mjs', 'admin-control'], { NODE_AUTH_TOKEN: process.env.LINGXIOS_PACKAGES_TOKEN })
  }
  const vite = { VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAEsX5eyOl1nAe5i9', VITE_LINGXILIT_URL: 'https://openlit.lingxilearn.cn' }
  await Promise.all([run('web build', 'npm', ['run', 'build'], vite), run('admin build', 'npm', ['run', 'admin:build'], vite), run('d1', 'npm', ['run', 'control:d1:remote'])])
  for (const config of ['workers/control-plane/wrangler.jsonc', 'workers/web-static/wrangler.jsonc']) {
    await run(config.split('/')[1], 'npx', ['--no-install', 'wrangler', 'deploy', '--config', config, '--tag', head])
  }
  console.log('workers: deployed')
}

async function status(ssh) {
  await Promise.all(Object.keys(HOSTS).map(host => ssh.run(host, host,
    `cat /opt/lingxiloop/*/images.env 2>/dev/null | sort -u; docker ps --format '{{.Names}}\t{{.Status}}' | sort`)))
}

if (!process.env.DEPLOY_SSH_KEY) {
  const child = spawn('npm', ['exec', '--yes', '--package=sigillo@0.14.2', '--', 'sigillo', 'run', ...SIGILLO, '--', 'node', 'deploy/cli.mjs', ...process.argv.slice(2)], {
    stdio: 'inherit', shell,
    // Use the shell's HTTP(S)_PROXY for fetch where one is configured.
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --disable-warning=UNDICI-EHPA`.trim(), SIGILLO_API_URL: process.env.SIGILLO_API_URL || 'https://sigillo.lingxilearn.cn' },
  })
  child.on('exit', code => process.exit(code ?? 1))
} else {
  const [command = 'up', ...stacks] = process.argv.slice(2)
  const started = Date.now()
  main(command, stacks).then(
    () => console.log(`deploy ${command} done in ${Math.round((Date.now() - started) / 1000)}s`),
    error => { console.error(`deploy ${command} failed: ${error.message}`); process.exit(1) },
  )
}
