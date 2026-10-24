import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function serviceBlock(source: string, name: string, next: string): string {
  const start = source.indexOf(`  ${name}:`)
  const end = source.indexOf(`\n  ${next}:`, start)
  assert.notEqual(start, -1, `${name} service is missing`)
  assert.notEqual(end, -1, `${next} service boundary is missing`)
  return source.slice(start, end)
}

test('Open Notebook keeps knowledge networking private and shares R2 without a public base', () => {
  const mvp = readFileSync(new URL('../../../docker-compose.mvp.yml', import.meta.url), 'utf8')
  const notebook = serviceBlock(mvp, 'open-notebook', 'wukongim')
  const surreal = serviceBlock(mvp, 'surrealdb', 'open-notebook')
  assert.match(surreal, /networks: \[lingxiloop-knowledge-internal/)
  assert.match(notebook, /lingxiloop-knowledge-internal/)
  assert.match(notebook, /lingxiloop-knowledge-egress/)
  assert.doesNotMatch(surreal, /\n {4}ports:/)
  assert.doesNotMatch(notebook, /\n {4}ports:/)
  for (const variable of [
    'R2_ENDPOINT',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'OPEN_NOTEBOOK_R2_PREFIX',
  ]) {
    assert.match(notebook, new RegExp(`${variable}:`))
  }
  assert.doesNotMatch(notebook, /R2_PUBLIC_BASE:/)
})

test('local Open Notebook health checks the API and ingestion worker exposed by the image', () => {
  const mvp = readFileSync(new URL('../../../docker-compose.mvp.yml', import.meta.url), 'utf8')
  const notebook = serviceBlock(mvp, 'open-notebook', 'wukongim')
  assert.match(notebook, /surreal-commands-worker/)
  assert.match(notebook, /curl -fsS http:\/\/localhost:5055\/health/)
  assert.doesNotMatch(notebook, /supervisorctl status rag-/)
})
