import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { childEnvironment } from './with-secrets.mjs'

const protocol = JSON.parse(await readFile(new URL('./protocol.json', import.meta.url)))
// Configuration metadata only: never print values of keys, tokens or connection strings.
const configured = process.env.OPENAI_BASE_URL ? new URL(process.env.OPENAI_BASE_URL.trim()) : null
console.log(JSON.stringify({
  modelVariableNames: Object.keys(process.env).filter(name => /DEEPSEEK|SILICONFLOW|OPENAI|MODEL/.test(name)).sort(),
  configuredProviderHost: configured?.hostname ?? null,
  configuredModel: /^[a-zA-Z0-9_./:-]{1,160}$/.test(process.env.OPENAI_MODEL ?? '') ? process.env.OPENAI_MODEL : null,
}))
const env = childEnvironment(process.env, 'live')
const production = await fetch('https://loop.lingxilearn.cn/api/meta', {
  redirect: 'error', signal: AbortSignal.timeout(20000),
})
assert.ok(production.ok, `Production metadata HTTP ${production.status}`)
const meta = await production.json()
assert.equal(meta.reasoningRuntime?.runtime, protocol.runtimes.lingxios.version, 'Production runtime changed')
assert.equal(meta.commitSha, protocol.runtimes.lingxios.commit, 'Production commit changed; review the frozen protocol')
const models = await fetch(new URL('/models', protocol.model.baseUrl), {
  headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
  redirect: 'error', signal: AbortSignal.timeout(20000),
})
assert.ok(models.ok, `Provider model discovery HTTP ${models.status}`)
const catalog = await models.json()
assert.ok(catalog.data?.some(model => model.id === protocol.model.id), 'Pinned model absent from provider catalog')
const files = ['protocol.json', 'compare.py', 'run.mjs', 'gateway.mjs', 'runtimes.mjs',
  'dsh-tools.mjs', 'package-lock.json', 'with-secrets.mjs', 'preflight.mjs']
const sha256 = {}
for (const file of files) sha256[file] = createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex')
await mkdir(new URL('./.state/', import.meta.url), { recursive: true })
await writeFile(new URL('./.state/provenance.json', import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(), productionCommit: meta.commitSha,
  runtimeVersion: meta.reasoningRuntime.runtime, model: protocol.model,
  node: process.version, platform: process.platform, architecture: process.arch,
  evaluationCommit: process.env.GITHUB_SHA ?? null,
  actionsRunId: process.env.GITHUB_RUN_ID ?? null, sha256,
}, null, 2) + '\n', { mode: 0o600 })
console.log('Production version and official provider model verified; no secret values retained')
