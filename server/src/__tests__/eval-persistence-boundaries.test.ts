import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Eval application logic cannot bypass its explicit persistence boundary', async () => {
  const [service, repository, facade] = await Promise.all([
    readFile(new URL('../eval/service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../eval/repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../eval/facade.ts', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(service, /from ['"][^'"]*db\//)
  assert.doesNotMatch(service, /\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)
  assert.match(service, /evalPersistence/)
  assert.match(repository, /Queryable/)
  assert.match(repository, /TransactionRunner/)
  assert.doesNotMatch(repository, /from ['"]\.\.\/db\/pool\.js['"]/)
  assert.match(facade, /from ['"]\.\.\/db\/pool\.js['"]/)
  assert.match(facade, /withTransaction/)
})
