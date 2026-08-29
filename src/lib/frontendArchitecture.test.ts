import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sourceRoot = fileURLToPath(new URL('../', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

test('frontend has one production data plane and no local preview application', () => {
  assert.equal(existsSync(`${sourceRoot}/dev`), false)
  assert.equal(existsSync(`${sourceRoot}/web/WebShell.tsx`), false)
  const production = sourceFiles(sourceRoot)
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  assert.doesNotMatch(production, /isMockImDevelopment|mockLearning|mock-user|mock-source|startsWith\(['"]mock-|@\/dev\//)
  assert.doesNotMatch(production, /dataBase64|\/uploads['"]\s*,/)
  assert.equal(existsSync(`${sourceRoot}/api/conversations.ts`), false)
  assert.equal(existsSync(`${sourceRoot}/stores/conversations.ts`), false)
  assert.equal(existsSync(`${sourceRoot}/features/conversations/api.ts`), true)
  assert.equal(existsSync(`${sourceRoot}/features/conversations/store.ts`), true)
  assert.equal(existsSync(`${sourceRoot}/api/messages.ts`), false)
  assert.equal(existsSync(`${sourceRoot}/stores/messages.ts`), false)
  assert.equal(existsSync(`${sourceRoot}/features/chat/api.ts`), true)
  assert.equal(existsSync(`${sourceRoot}/features/chat/state/messages.ts`), true)
  assert.equal(existsSync(`${sourceRoot}/api/knowledge.ts`), false)
  assert.equal(existsSync(`${sourceRoot}/stores/knowledgeSources.ts`), false)
  assert.equal(existsSync(`${sourceRoot}/features/knowledge/state.ts`), true)
})

test('frontend typecheck never emits a second Vite configuration', () => {
  const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as { scripts: Record<string, string> }
  const nodeConfig = JSON.parse(readFileSync(`${root}/tsconfig.node.json`, 'utf8')) as { compilerOptions?: { noEmit?: boolean; composite?: boolean } }
  assert.doesNotMatch(packageJson.scripts.build, /tsc\s+-b/)
  assert.equal(nodeConfig.compilerOptions?.noEmit, true)
  assert.notEqual(nodeConfig.compilerOptions?.composite, true)
  for (const artifact of ['vite.config.js', 'vite.config.d.ts', 'tsconfig.node.tsbuildinfo', 'tsconfig.tsbuildinfo']) {
    assert.equal(existsSync(`${root}/${artifact}`), false, `${artifact} must not be emitted`)
  }
})
