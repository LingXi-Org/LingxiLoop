import { spawn } from 'node:child_process'

// Fail closed on missing/obscured credentials or an unexpected endpoint. Never
// print credential values, persist them, or pass deployment credentials to tests.
let modelKey = process.env.OPENAI_API_KEY
if (!modelKey) {
  const { KOMODO_API_KEY: key, KOMODO_API_SECRET: secret, KOMODO_WEBHOOK_URL: endpoint } = process.env
  if (!key || !secret || !endpoint) throw new Error('Model acceptance requires model access or configured Komodo credentials')
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.hostname !== 'ops.christmas1314.xyz') throw new Error('Invalid Komodo origin')
  const response = await fetch(new URL('/read/GetVariable', url), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'x-api-secret': secret },
    body: JSON.stringify({ name: 'OPENAI_API_KEY' }), signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Model credential lookup returned HTTP ${response.status}`)
  const variable = await response.json()
  if (variable.name !== 'OPENAI_API_KEY' || typeof variable.value !== 'string' || !variable.value.trim() || /^#+$/.test(variable.value)) {
    throw new Error('Model credential is unavailable to the configured Komodo identity')
  }
  modelKey = variable.value
}
const childEnv = { ...process.env, OPENAI_API_KEY: modelKey }
for (const name of Object.keys(childEnv)) if (name.startsWith('KOMODO_')) delete childEnv[name]
const child = spawn(process.execPath, ['server/run-integration-tests.mjs', '--file', 'available-capabilities.test.ts'], {
  env: childEnv, stdio: 'inherit',
})
child.on('error', () => { console.error('Could not start model acceptance'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
