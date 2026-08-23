#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve('.')
const failures = []
const bannedPaths = [
  'agent-cli', 'agent-fuse', 'server/lingxigraph', 'server/src/agents/runtime',
  'server/src/agents/computer/daemon.ts', 'server/src/agents/computer/engine.ts',
  'server/src/agents/computer/registry.ts', 'server/src/agents/turn.ts',
]
for (const path of bannedPaths) {
  const absolute = join(root, path)
  if (existsSync(absolute) && (statSync(absolute).isFile() || files(absolute).length > 0)) failures.push(`retired path exists: ${path}`)
}

function files(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) return files(path)
    return entry.isFile() ? [path] : []
  })
}

const runtimeFiles = [
  ...files(join(root, 'server/src')),
  ...files(join(root, 'src')),
  ...files(join(root, 'server/docker')),
  ...['package.json', '.env.example', 'docker-compose.mvp.yml', 'docker-compose.mvp.ci.yml', 'docker-compose.production.yml'].map((path) => join(root, path)),
].filter((path) => existsSync(path) && ['.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.example', '.Dockerfile', ''].includes(extname(path)) || path.endsWith('Dockerfile'))

for (const path of runtimeFiles) {
  const rel = relative(root, path).replaceAll('\\', '/')
  if (rel === 'server/src/db/migrate.ts') continue // one-way legacy data identification/drop allowlist
  const source = readFileSync(path, 'utf8')
  if (/\b(?:spawn|execFile|exec)\s*\([^\n]*(?:codex|claude)/i.test(source)) failures.push(`${rel}: local Codex/Claude executable integration`)
  if (/LINGXIGRAPH_|LINGXILOOP_REASONING_RUNTIME|byoa-(?:claude|codex)|agent computer --pair|requestPairingCode/i.test(source)) failures.push(`${rel}: retired runtime/BYOA configuration`)
  if (/\/computers(?:\/|['"`])/.test(source)) failures.push(`${rel}: retired agent-host pairing API`)
  if (/fast_model|fastModel|participants\.model|p\.computer_id|p\.engine/.test(source)) failures.push(`${rel}: retired per-Agent runtime/model field`)
  if (/OPENAI_(?:API_KEY|BASE_URL|MODEL|IMAGE_MODEL)/.test(source)) failures.push(`${rel}: provider configuration must use DeepSeek only`)
}

const tool = readFileSync(join(root, 'server/src/agent-os/tool.ts'), 'utf8')
if (!/MODEL_TOOLS[^\n]*Object\.freeze\(\[IPYTHON_TOOL\]\)/.test(tool)) failures.push('Agent OS model tool surface is not exactly IPython')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (packageJson.bin) failures.push('package.json must not publish a local agent CLI')

const learningActions = readFileSync(join(root, 'server/src/agent-os/learning-actions.ts'), 'utf8')
if (/\brunCli\b|cliArgv|tokenize\(/.test(learningActions)) failures.push('Agent OS Host Bridge must call structured domain services, not CLI parsing')
const websocketBridge = readFileSync(join(root, 'server/src/ws.ts'), 'utf8')
if (/sub\.subscribe\([\s\S]{0,300}CH_(?:MESSAGE_NEW|MESSAGE_DELTA|TYPING|REACTIONS|POLLS)/.test(websocketBridge)) {
  failures.push('custom WebSocket/Redis bridge still subscribes to chat channels')
}
const pinnedCommit = 'c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47'
const mvpCompose = readFileSync(join(root, 'docker-compose.mvp.yml'), 'utf8')
if (/\bbuild:/.test(mvpCompose)) failures.push('docker-compose.mvp.yml must pull packages and never build locally')
const agentOsImageTemplate = /lingxiloop-agent-os:\$\{LINGXILOOP_IMAGE_TAG:-mvp\}/
if (!mvpCompose.includes('accel.way2api.fun/ghcr.io') || !agentOsImageTemplate.test(mvpCompose)) {
  failures.push('docker-compose.mvp.yml does not use accelerated GHCR MVP packages')
}
const ciCompose = readFileSync(join(root, 'docker-compose.mvp.ci.yml'), 'utf8')
if (!ciCompose.includes(`WUKONG_COMMIT: ${pinnedCommit}`)) failures.push('docker-compose.mvp.ci.yml: WuKongIM v3 source is not commit-pinned')
const productionCompose = readFileSync(join(root, 'docker-compose.production.yml'), 'utf8')
if (!productionCompose.includes('WUKONGIM_IMAGE must pin v3 commit') || !productionCompose.includes('by digest')) {
  failures.push('docker-compose.production.yml must require a digest-pinned WuKongIM package')
}
const ciWorkflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
for (const image of ['lingxiloop-server', 'lingxiloop-agent-os', 'lingxiloop-wukongim', 'lingxiloop-computer-runtime', 'lingxiloop-user-computer']) {
  if (!ciWorkflow.includes(`package: ${image}`)) failures.push(`CI does not publish ${image} package`)
}
if (/\blingxiloop:\s*[\s\S]{0,1200}\/var\/run\/docker\.sock/.test(mvpCompose)) {
  failures.push('public LingxiLoop API service must not mount the Docker socket')
}
const wukongDockerfile = readFileSync(join(root, 'server/docker/wukongim.Dockerfile'), 'utf8')
if (!/git fetch --depth 1 origin "\$WUKONG_COMMIT"/.test(wukongDockerfile) || !/git rev-parse HEAD/.test(wukongDockerfile)) {
  failures.push('WuKongIM Dockerfile does not fetch and verify the configured commit')
}

if (failures.length) {
  console.error(['Agent OS guard failed:', ...failures.map((item) => `- ${item}`)].join('\n'))
  process.exit(1)
}
console.log('Agent OS guard passed: DeepSeek-only provider, packaged MVP, no legacy runtime, model-visible tools = [ipython].')
