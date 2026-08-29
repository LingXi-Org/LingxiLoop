import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const composeFiles = [
  '../../../docker-compose.mvp.yml',
  '../../../docker-compose.mvp.ci.yml',
  '../../../docker-compose.production.yml',
]

function serviceBlock(source: string, name: string, next: string): string {
  const start = source.indexOf(`  ${name}:`)
  const end = source.indexOf(`\n  ${next}:`, start)
  assert.notEqual(start, -1, `${name} service is missing`)
  assert.notEqual(end, -1, `${next} service boundary is missing`)
  return source.slice(start, end)
}

test('Agent OS has no direct network path to Open Notebook or SurrealDB', () => {
  for (const relative of composeFiles) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    const surreal = serviceBlock(source, 'surrealdb', 'open-notebook')
    const notebook = serviceBlock(source, 'open-notebook', relative.includes('ci') ? 'fake-openai-provider' : 'wukongim')
    const lingxiloop = serviceBlock(source, 'lingxiloop', 'agent-os')
    const agent = source.slice(source.indexOf('  agent-os:'), source.indexOf('\nnetworks:'))
    assert.match(surreal, /networks: \[lingxiloop-knowledge-internal/)
    assert.match(notebook, /lingxiloop-knowledge-internal/)
    assert.match(notebook, /lingxiloop-knowledge-egress/)
    assert.doesNotMatch(surreal, /\n {4}ports:/)
    assert.doesNotMatch(notebook, /\n {4}ports:/)
    assert.match(lingxiloop, /lingxiloop-knowledge-internal/)
    assert.doesNotMatch(agent, /lingxiloop-knowledge/)
  }
})

test('Open Notebook shares LingxiLoop R2 credentials without exposing R2 publicly', () => {
  const mvp = readFileSync(new URL('../../../docker-compose.mvp.yml', import.meta.url), 'utf8')
  const notebook = serviceBlock(mvp, 'open-notebook', 'wukongim')
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

  const ci = readFileSync(new URL('../../../docker-compose.mvp.ci.yml', import.meta.url), 'utf8')
  const ciNotebook = serviceBlock(ci, 'open-notebook', 'fake-openai-provider')
  assert.match(ciNotebook, /OPEN_NOTEBOOK_R2_ENABLED: "true"/)
  for (const variable of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    assert.match(ciNotebook, new RegExp(`${variable}:`))
  }
  assert.doesNotMatch(ciNotebook, /R2_PUBLIC_BASE:/)
})
