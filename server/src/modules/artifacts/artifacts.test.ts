import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { Queryable } from '../../db/queryable.js'
import { createArtifactApplication } from './application.js'
import { createArtifactExecution } from './execution.js'
import { addMessage, addThread, agentViews, canSendToAgent, editMessage, emptyDoc, pendingForAgent, readNewThread, sendToAgent } from './comments.js'
import { issueGrant, readGrant } from './grants.js'
import { ARTIFACT_KIND_DEFINITIONS, BAOYU_DESIGN_ROOT } from './kinds.js'
import { artifactSkills } from './skills.js'
import { blobIdOf, fileOf, isWireEntry, putBlob, sha256 } from './store.js'

const grant = { artifactId: 'design-1', companyId: 'company', userId: 'user', kind: 'design' as const, write: true }

test('new artifacts install local themes with compatible Slides authoring defaults', () => {
  const { slides, design } = ARTIFACT_KIND_DEFINITIONS
  const at = '2026-11-02T00:00:00.000Z'
  const first = slides.initialIndex('New deck', at)
  const second = slides.initialIndex('Other deck', at)
  assert.deepEqual(first.order, [])
  assert.equal(first.title, 'New deck')
  assert.ok(Array.isArray(first.style) && first.style.length === 1)
  assert.notEqual(first.style, second.style)
  const expected = ['slides-builtin', 'baoyu-ember', 'baoyu-seazar']
  const builtin = JSON.parse(readFileSync('third_party/baoyu-design/host/slides-builtin-style.json', 'utf8'))
  const demo = JSON.parse(readFileSync('third_party/baoyu-design/distribution/skills/claude-design-system/artifact-type/demo.json', 'utf8'))
  const seazar = JSON.parse(readFileSync('third_party/baoyu-design/distribution/skills/claude-design-system/artifact-type/reference/sample-seazar-tokens.json', 'utf8'))
  const expectedTokens = [builtin.tokens, JSON.parse(demo.content.files['tokens.json']), seazar]
  assert.deepEqual(first.style, builtin.style.map((style:{text:string})=>({...style,text:style.text.replace(/,430,/g, ',400,')})))
  for (const kind of [design, slides]) {
    const index = kind.initialIndex('New', at)
    const systems = index.designSystems as Array<{ namespace: string; title: string; artifact: string; version: string; copiedAt: string }>
    assert.deepEqual(systems.map(system => system.namespace), expected)
    assert.deepEqual(systems.map(system => system.title), ['Claude 经典', 'Ember', 'Seazar'])
    assert.ok(systems.every(system => system.artifact.startsWith('https://github.com/JimLiu/baoyu-design/') && system.version === builtin.version))
    for (const [i, system] of systems.entries()) {
      assert.equal(system.copiedAt, at)
      const path = `project/ds/${system.namespace}/tokens.json`
      const expectedResource = structuredClone(expectedTokens[i])
      if (kind.kind === 'slides' && system.namespace === 'slides-builtin') {
        for (const group of expectedResource.type.groups) for (const style of group.styles) if (style.fontWeight === 430) style.fontWeight = 400
      }
      assert.deepEqual(kind.initialResources?.[path], expectedResource, path)
      assert.ok(fileOf(kind, path), path)
    }
  }
  assert.notEqual(first.designSystems, second.designSystems)
})

test('new Slides authoring typography uses only weights supported by editable HTML', () => {
  const slides = ARTIFACT_KIND_DEFINITIONS.slides
  const tokens = slides.initialResources?.['project/ds/slides-builtin/tokens.json'] as {type:{groups:{styles:{fontWeight:number}[]}[]}}
  for (const style of tokens.type.groups.flatMap(group=>group.styles)) {
    assert.ok(style.fontWeight >= 100 && style.fontWeight <= 900 && style.fontWeight % 100 === 0, `unsupported default weight ${style.fontWeight}`)
  }
  const index = slides.initialIndex('New', '2026-11-04T00:00:00Z')
  for (const style of index.style as {text:string}[]) for (const token of style.text.split(' ')) {
    const weight = Number(token.split(':')[1].split(',')[1])
    assert.equal(weight % 100, 0, `unsupported deck style weight ${weight}`)
  }
})

test('file reads return a hash of their own bytes even when the listing has advanced', async () => {
  const bytes = Buffer.from('original file')
  const db = { async query(sql: string) {
    if (sql.startsWith('SELECT * FROM artifacts')) return { rows: [{ id: 'design-1', kind: 'design' }] }
    if (sql.startsWith('SELECT body')) return { rows: [{ body: bytes }] }
    if (sql.startsWith('SELECT path,sha256')) return { rows: [{ path: 'project/Main.dc.html', sha256: sha256('new file'), size: 8, content_type: 'text/html' }] }
    throw new Error(`unexpected query: ${sql}`)
  } } as Queryable
  const unexpected = async (): Promise<never> => { throw new Error('unexpected mutation') }
  const app = createArtifactApplication({ db, execution: createArtifactExecution(unexpected), transaction: unexpected,
    withArtifactFence: unexpected, missingChannelMessageIds: unexpected, publishEvent: unexpected, deliverComment: unexpected })
  assert.deepEqual(await app.readArtifactFile('company', 'design-1', 'project/Main.dc.html'), {
    path: 'project/Main.dc.html', sha256: sha256(bytes), bytes,
  })
})

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

test('Slides asset storage refuses video before any storage or database mutation', async () => {
  const db = { query: () => { throw new Error('video must not reach persistence') } } as unknown as Queryable
  for (const type of ['video/mp4', ' Video/WebM; codecs=vp9']) {
    await assert.rejects(putBlob(db, ARTIFACT_KIND_DEFINITIONS.slides, 'slides-1', Buffer.from('video'), type),
      { code: 'invalid_content', status: 415 })
  }
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

test('Chinese and existing English slide comments keep the same file location', () => {
  const index = { order: ['cover', 'plan'] }
  const exists = (file: string) => file === 'project/slides/plan.html'
  for (const label of ['Slide 2 #plan', 'Area on slide 2 #plan', '幻灯片 2 #plan', '第 2 页 #plan', '第 2 页']) {
    assert.deepEqual(ARTIFACT_KIND_DEFINITIONS.slides.commentLocation({ label }, index, exists), {
      file: 'project/slides/plan.html', slide: 2, slideId: 'plan',
    })
  }
})

test('retained design resources keep their reviewed source bytes', () => {
  const root = resolve(BAOYU_DESIGN_ROOT, '..')
  const manifest = JSON.parse(readFileSync(resolve(root, 'retained-manifest.json'), 'utf8')) as { commit: string; files: { path: string; bytes: number; sha256: string }[] }
  assert.equal(manifest.commit, '016b39d7fdcc30bfacee31ea5541498ac53921c6')
  assert.ok(manifest.files.length > 30)
  assert.ok(manifest.files.some(file => file.path === 'host/slides-builtin-style.json'))
  for (const file of manifest.files) {
    const bytes = readFileSync(resolve(root, file.path))
    assert.equal(bytes.length, file.bytes, file.path)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
  }
})

test('native authoring preserves design guidance and replaces the retired file-write protocol', () => {
  for (const skill of artifactSkills) {
    const kind = skill.name === 'claude-design' ? 'design' : 'slides'
    assert.match(skill.body, /^LingxiLoop native DOM\/SVG editor adaptation of baoyu-design/)
    assert.ok(skill.body.includes(`${kind}.apply_ops`))
    assert.ok(skill.actions.includes(`${kind}.read_document`))
    assert.ok(skill.actions.includes(`${kind}.read_page`))
    assert.ok(!skill.actions.includes(`${kind}.write_files`))
    assert.ok(!skill.body.includes('artifact.mjs <command>'))
    assert.ok(!skill.body.includes('--agent-hook'))
    // Upstream's local-network sharing, version history and git sections are not this host's.
    for (const local of ['share <root>', 'archive <root>', 'history/index.json', '.git/hooks/pre-commit', '## History', '## Keeping it in git']) {
      assert.ok(!skill.body.includes(local), local)
    }
    assert.ok(skill.body.includes('## Sharing\n\nWho can open, edit or comment'))
    assert.ok(skill.body.includes('NEVER VERIFY UNLESS THE USER ASKED'))
    assert.ok(skill.actions.every(action => action.startsWith(`${kind}.`)))
  }
})
