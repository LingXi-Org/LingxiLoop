// Runs unchanged inside both old and candidate images. No product entrypoint,
// control instance, model, tool execution, or database query is invoked.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const name = manifest.dependencies?.['@lingxi-org/lingxios'] ? '@lingxi-org/lingxios' : '@lyyzka/lingxios'
const { assembleHarness, releaseVersions, toolContractHash } = await import(name)

process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
const product = path => import(pathToFileURL(resolve(path)).href)
const { createProductHarness } = await product('server/src/agent-runtime/harness.ts')
const { createProductTools } = await product('server/src/agent-runtime/tools.ts')
const { closeDatabasePools } = await product('server/src/db/pool.ts')
const { redis, sub } = await product('server/src/redis.ts')
try {
  const unavailableControl = () => { throw new Error('harness observation must not access runtime control') }
  const actual = assembleHarness(createProductHarness(createProductTools(unavailableControl), unavailableControl))
  const { id, version, hash } = actual.context
  process.stdout.write(JSON.stringify({ runtime: releaseVersions.runtime, id, version, hash,
    skills: actual.context.skills.map(({ name, version, hash }) => ({ name, version, hash })),
    tools: actual.tools.map(tool => ({ action: tool.action, hash: toolContractHash(tool) })),
    presentations: actual.context.presentations.map(({ type, version }) => ({ type, version })),
  }) + '\n')
} finally {
  redis.disconnect(); sub.disconnect()
  await closeDatabasePools()
}
