import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { addMessage, addThread, agentViews, canSendToAgent, editMessage, emptyDoc, pendingForAgent, readNewThread, sendToAgent } from './comments.js'
import { issueGrant, readGrant } from './grants.js'
import { ARTIFACT_KIND_DEFINITIONS, BAOYU_DESIGN_ROOT } from './kinds.js'
import { artifactSkills } from './skills.js'
import { blobIdOf, fileOf, isWireEntry } from './store.js'

const grant = { artifactId: 'design-1', companyId: 'company', userId: 'user', kind: 'design' as const, write: true }

test('editor grants bind artifact, person and mode, and reject tampering or expiry', () => {
  const issued = issueGrant(grant, 1_000)
  assert.deepEqual(readGrant(issued.grant, 2_000), { ...grant, expiresAt: issued.expiresAt })
  assert.equal(readGrant(issued.grant, issued.expiresAt), null)
  const [payload, signature] = issued.grant.split('.')
  const forged = Buffer.from(JSON.stringify(['design-2', 'company', 'user', 'design', 1, issued.expiresAt])).toString('base64url')
  assert.equal(readGrant(`${forged}.${signature}`, 2_000), null)
  assert.equal(readGrant(`${payload}.${signature}x`, 2_000), null)
  assert.equal(readGrant(`${payload}.${signature}.extra`, 2_000), null)
})

test('upload ids are bound to their artifact', () => {
  const sha = 'a'.repeat(64)
  assert.match(blobIdOf('design-1', sha), /^[0-9a-f]{32}$/)
  assert.notEqual(blobIdOf('design-1', sha), blobIdOf('design-2', sha))
})

test('each kind keeps the upstream writable paths', () => {
  const { design, slides } = ARTIFACT_KIND_DEFINITIONS
  assert.equal(fileOf(design, 'project/Main.dc.html'), 'Main.dc.html')
  assert.equal(fileOf(design, 'project/assets/x.png'), null)
  assert.equal(fileOf(design, 'project/../x'), null)
  assert.equal(fileOf(design, 'project/.hidden'), null)
  assert.equal(fileOf(slides, 'project/deck.json'), 'deck.json')
  assert.equal(fileOf(slides, 'project/slides/cover.html'), 'slides/cover.html')
  assert.equal(fileOf(slides, 'project/slides/a/b.html'), null)
  assert.equal(fileOf(slides, 'project/notes.md'), null)
  assert.equal(isWireEntry({ base64: '', contentType: 'text/html', ifMatch: null }), true)
  assert.equal(isWireEntry({ delete: true, ifMatch: 7 }), false)
})

test('comment threads follow the upstream agent hand-off lifecycle', () => {
  const doc = emptyDoc(), now = '2026-10-30T00:00:00.000Z'
  const input = readNewThread({ anchor: 'a', label: 'Slide 2 #plan', text: ' Bigger title ', send: true })!
  const thread = addThread(doc, input, { file: 'project/slides/plan.html' }, { kind: 'user', name: 'Ada', id: 'ada' }, now)
  assert.equal(thread.messages[0].text, 'Bigger title')
  assert.deepEqual(pendingForAgent(doc).map(item => item.id), [thread.id])
  assert.equal(agentViews(doc, [thread])[0].n, 1)
  assert.equal(canSendToAgent(thread), false)
  addMessage(thread, { kind: 'agent', name: 'agent' }, 'Done', '2026-10-30T00:01:00.000Z')
  assert.equal(thread.agent?.status, 'replied')
  assert.throws(() => editMessage(thread, thread.messages[0].id, 'x', now, 'someone-else'))
  addMessage(thread, { kind: 'user', name: 'Ada', id: 'ada' }, 'Smaller', '2026-10-30T00:02:00.000Z')
  assert.equal(canSendToAgent(thread), true)
  sendToAgent(thread, '2026-10-30T00:03:00.000Z')
  assert.equal(thread.agent?.status, 'pending')
})

test('every vendored upstream file keeps its pinned bytes', () => {
  const root = resolve(BAOYU_DESIGN_ROOT, '..')
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as { commit: string; files: { path: string; bytes: number; sha256: string }[] }
  assert.equal(manifest.commit, 'c15e76ef5134228d2bb5da35652d30d7d6b8a34d')
  assert.equal(manifest.files.length, 57)
  for (const file of manifest.files) {
    const bytes = readFileSync(resolve(root, file.path))
    assert.equal(bytes.length, file.bytes, file.path)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
  }
})

test('the vendored skills replace only the local CLI sections', () => {
  for (const skill of artifactSkills) {
    const kind = skill.name === 'claude-design' ? 'design' : 'slides'
    assert.match(skill.body, /^LingxiLoop Web host adaptation of the vendored baoyu-design/)
    assert.ok(skill.body.includes(`${kind}.write_files`))
    assert.ok(!skill.body.includes('artifact.mjs <command>'))
    assert.ok(!skill.body.includes('--agent-hook'))
    assert.ok(skill.body.includes('NEVER VERIFY UNLESS THE USER ASKED'))
    assert.ok(skill.actions.every(action => action.startsWith(`${kind}.`)))
  }
})
