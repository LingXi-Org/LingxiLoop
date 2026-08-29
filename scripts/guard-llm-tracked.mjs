import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const root = resolve('server/src')
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.name.endsWith('.ts') && !path.includes('__tests__')) files.push(path)
  }
}
await walk(root)

const violations = []
for (const file of files) {
  const name = relative(process.cwd(), file).replaceAll('\\', '/')
  const source = await readFile(file, 'utf8')
  if (/\bnew\s+OpenAI\s*\(/.test(source) && name !== 'server/src/llm-client.ts') {
    violations.push(`${name}: provider SDK construction must stay in llm-client.ts`)
  }
  if (/\.(chat\.completions|embeddings|images)\.(create|generate)\s*\(/.test(source)
      && name !== 'server/src/llm.ts'
      && name !== 'server/src/agent-os/model-driver.ts') {
    violations.push(`${name}: direct provider call bypasses the tracked LLM boundary`)
  }
}

const schema = await readFile(resolve('server/src/db/schema.sql'), 'utf8')
if (!/CREATE TABLE public\.llm_calls\s*\(/.test(schema)) violations.push('schema.sql: llm_calls ledger is required')
const controlPlane = await readFile(resolve('server/src/agent-os/control-plane.ts'), 'utf8')
if (!controlPlane.includes("event.kind === 'model.completed'") || !controlPlane.includes('recordLlmCall')) {
  violations.push('agent-os/control-plane.ts: model.completed events must enter llm_calls')
}

if (violations.length > 0) {
  console.error(`LLM tracking guard failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}
console.log(`LLM tracking guard passed (${files.length} production TypeScript files scanned).`)
