#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve('.')
const failures = []

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)) ? [path] : []
  })
}

// This guard deliberately checks active AgentOS composition, not whether
// archived migration/reference directories still exist in the repository.
const activeFiles = [
  ...sourceFiles(join(root, 'server/src/agent-os')),
  join(root, 'server/src/index.ts'),
  join(root, 'server/src/im/router.ts'),
  join(root, 'src/lib/im/wukong.ts'),
  join(root, 'src/stores/messages.ts'),
]

for (const retiredPath of [
  join(root, 'server/lingxigraph'),
  join(root, 'server/docker/agent-computer-lingxiloop-web.sh'),
]) {
  if (existsSync(retiredPath)) {
    failures.push(`${relative(root, retiredPath).replaceAll('\\', '/')}: retired source path must not exist`)
  }
}

for (const path of activeFiles) {
  const rel = relative(root, path).replaceAll('\\', '/')
  const source = readFileSync(path, 'utf8')
  if (/server\/lingxigraph|(?:from|import\s*\()[^\n]{0,160}lingxigraph/i.test(source)) {
    failures.push(`${rel}: active AgentOS depends on retired LingxiGraph runtime`)
  }
  if (/@openai\/codex|\bcodex\s+exec\b|\bCODEX_HOME\b|BYOA_CODEX|(?:spawn|execFile|exec)\s*\([^\n]{0,200}\bcodex\b/i.test(source)) {
    failures.push(`${rel}: active AgentOS depends on a local Codex CLI/runtime`)
  }
  if (/computer-runtime|user-computer|agent-computer|COMPUTER_RUNTIME_SERVICE_TOKEN|loop\.computer|computer\.(?:input|takeover|screenshot)/i.test(source)) {
    failures.push(`${rel}: active AgentOS depends on retired Computer runtime`)
  }
}

const tool = readFileSync(join(root, 'server/src/agent-os/tool.ts'), 'utf8')
if (!/MODEL_TOOLS[^\n]*Object\.freeze\(\[IPYTHON_TOOL\]\)/.test(tool)) {
  failures.push('AgentOS model-visible tool surface is not exactly IPython')
}

if (failures.length > 0) {
  console.error(['Agent OS architecture guard failed:', ...failures.map((failure) => `- ${failure}`)].join('\n'))
  process.exit(1)
}
console.log('Agent OS architecture guard passed: no legacy runtime, Codex CLI, or Computer runtime dependencies; tools = [ipython].')
