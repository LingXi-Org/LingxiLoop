import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { artifactThemeResourcesSchema, createDocument, createNode, createPage, isSafeArtifactSvg, validateArtifactDocument } from './artifact-document.js'
import { applyOperations, ArtifactOperationConflict, prepareBatch } from './artifact-operations.js'
import { artifactPageBackground, artifactResolvedStyle, artifactThemeDefaults, projectArtifactThemes } from './artifact-themes.js'

function fixture() {
  const document = createDocument('slides', 'deck')
  const page = createPage('first')
  const node = createNode('text', 'title')
  node.text = 'Before'
  page.nodes[node.id] = node
  page.nodeOrder = [node.id]
  document.pages[page.id] = page
  document.pageOrder = [page.id]
  return document
}

test('代码样式与属性首次写入、重开、共享撤销重做及冲突保护',()=>{
  const before=fixture()
  const operations=[{type:'node.patch' as const,pageId:'first',nodeId:'title',patch:{css:{filter:'blur(1px)','max-width':'1800px'},attributes:{'data-label':'中文测试',title:'说明'}}}]
  const written=applyOperations(before,prepareBatch(before,operations,'set-code'))
  assert.equal(validateArtifactDocument(JSON.parse(JSON.stringify(written.document))).pages.first!.nodes.title!.css?.filter,'blur(1px)')
  const undone=applyOperations(written.document,prepareBatch(written.document,written.inverse,'undo-code'))
  assert.equal(undone.document.pages.first!.nodes.title!.css,undefined)
  assert.equal(undone.document.pages.first!.nodes.title!.attributes,undefined)
  const redone=applyOperations(undone.document,prepareBatch(undone.document,undone.inverse,'redo-code'))
  assert.deepEqual(redone.document.pages.first!.nodes.title!.attributes,operations[0].patch.attributes)
  assert.throws(()=>applyOperations(redone.document,prepareBatch(before,operations,'stale-code')),ArtifactOperationConflict)
  assert.equal(before.pages.first!.nodes.title!.css,undefined)
})

test('原生几何操作同步已有位置声明，撤销恢复原始表示，旧样式修改不能覆盖',()=>{
  const before=fixture(),node=before.pages.first!.nodes.title!
  node.x=760;node.css={left:'120px !important',filter:'blur(1px)'}
  const move=prepareBatch(before,[{type:'node.patch',pageId:'first',nodeId:'title',patch:{x:121}}],'move-code')
  const moved=applyOperations(before,move)
  assert.equal(moved.document.pages.first!.nodes.title!.css?.left,'121px !important')
  assert.equal(moved.document.pages.first!.nodes.title!.css?.filter,'blur(1px)')
  const undone=applyOperations(moved.document,prepareBatch(moved.document,moved.inverse,'undo-move-code'))
  assert.deepEqual(undone.document.pages.first!.nodes.title,node)
  const remote=applyOperations(before,prepareBatch(before,[{type:'node.patch',pageId:'first',nodeId:'title',patch:{css:{...node.css,left:'140px'}}}],'remote-code')).document
  assert.throws(()=>applyOperations(remote,move),ArtifactOperationConflict)
})

test('first motion identity write supports shared undo/redo, explicit removal and stale-field protection',()=>{
  const before=fixture(),written=applyOperations(before,prepareBatch(before,[{type:'node.patch',pageId:'first',nodeId:'title',patch:{motionId:'shared-heading'}}],'set-motion'))
  const undone=applyOperations(written.document,prepareBatch(written.document,written.inverse,'undo-motion'))
  assert.equal(undone.document.pages.first!.nodes.title!.motionId,undefined)
  const redone=applyOperations(undone.document,prepareBatch(undone.document,undone.inverse,'redo-motion'))
  assert.equal(redone.document.pages.first!.nodes.title!.motionId,'shared-heading')
  const removal=prepareBatch(redone.document,[{type:'node.patch',pageId:'first',nodeId:'title',patch:{},unset:['motionId']}],'remove-motion')
  const removed=applyOperations(redone.document,removal)
  assert.equal(removed.document.pages.first!.nodes.title!.motionId,undefined)
  assert.equal(applyOperations(removed.document,prepareBatch(removed.document,removed.inverse,'restore-motion')).document.pages.first!.nodes.title!.motionId,'shared-heading')
  const changed=applyOperations(redone.document,prepareBatch(redone.document,[{type:'node.patch',pageId:'first',nodeId:'title',patch:{motionId:'another-heading'}}],'remote-motion')).document
  assert.throws(()=>applyOperations(changed,removal),ArtifactOperationConflict)
  assert.equal(before.pages.first!.nodes.title!.motionId,undefined)
})

test('stale document revisions can change disjoint fields of the same node', () => {
  const before = fixture()
  const human = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'Human' } }], 'human')
  const agent = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { x: 240, style: { color: '#cc0000' } } }], 'agent')
  const afterHuman = applyOperations(before, human).document
  const afterBoth = applyOperations(afterHuman, agent).document
  assert.equal(afterBoth.pages.first!.nodes.title!.text, 'Human')
  assert.equal(afterBoth.pages.first!.nodes.title!.x, 240)
  assert.equal(before.pages.first!.nodes.title!.text, 'Before')
})

test('same field conflict rejects the entire batch without mutation', () => {
  const before = fixture()
  const first = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'Human' } }], 'first')
  const stale = prepareBatch(before, [
    { type: 'page.patch', pageId: 'first', patch: { notes: 'must not persist' } },
    { type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'Agent' } },
  ], 'stale')
  const current = applyOperations(before, first).document
  const serialized = JSON.stringify(current)
  assert.throws(() => applyOperations(current, stale), ArtifactOperationConflict)
  assert.equal(JSON.stringify(current), serialized)
})

test('inverse restores content but versions and sequence keep increasing', () => {
  const before = fixture()
  const forward = applyOperations(before, prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'After', style: { color: '#cc0000' } } }], 'edit'))
  const undone = applyOperations(forward.document, prepareBatch(forward.document, forward.inverse, 'undo'))
  assert.deepEqual(undone.document.pages, before.pages)
  assert.equal(undone.document.seq, 2)
  assert.throws(() => applyOperations(undone.document, prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'Stale' } }], 'old')), ArtifactOperationConflict)
})

test('deleted and recreated IDs invalidate older field edits', () => {
  const before = fixture()
  const stale = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { x: 99 } }], 'stale')
  const removed = applyOperations(before, prepareBatch(before, [{ type: 'node.delete', pageId: 'first', nodeId: 'title' }], 'delete'))
  const restored = applyOperations(removed.document, prepareBatch(removed.document, removed.inverse, 'restore')).document
  assert.throws(() => applyOperations(restored, stale), ArtifactOperationConflict)
})

test('different style fields merge, and missing CAS checks are rejected', () => {
  const before = fixture()
  const a = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { style: { color: '#ff0000' } } }], 'a')
  const b = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { style: { fontSize: 36 } } }], 'b')
  const current = applyOperations(applyOperations(before, a).document, b).document
  assert.deepEqual(current.pages.first!.nodes.title!.style, { ...before.pages.first!.nodes.title!.style, color: '#ff0000', fontSize: 36 })
  assert.throws(() => applyOperations(before, { ...a, expectedVersions: {} }), ArtifactOperationConflict)
})

test('page and group removal detect descendant changes and inverse restores structure', () => {
  const before = fixture()
  const group = createNode('group', 'group')
  before.pages.first!.nodes.group = group
  before.pages.first!.nodeOrder.unshift('group')
  before.pages.first!.nodes.title!.parentId = 'group'
  const staleDelete = prepareBatch(before, [{ type: 'page.delete', pageId: 'first' }], 'delete-page')
  const edited = applyOperations(before, prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'changed' } }], 'edit')).document
  assert.throws(() => applyOperations(edited, staleDelete), ArtifactOperationConflict)
  const removed = applyOperations(before, prepareBatch(before, [{ type: 'node.delete', pageId: 'first', nodeId: 'group' }], 'delete-group'))
  assert.deepEqual(removed.document.pages.first!.nodeOrder, [])
  const restored = applyOperations(removed.document, prepareBatch(removed.document, removed.inverse, 'restore-group')).document
  assert.deepEqual(restored.pages, before.pages)
})

test('native data rejects executable SVG, unknown properties and invalid graph references', () => {
  const before = fixture()
  assert.throws(() => validateArtifactDocument({ ...before, injected: '<script>' }))
  const page = before.pages.first!
  page.nodes.svg = { ...createNode('svg', 'svg'), svg: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><script>alert(1)</script></foreignObject></svg>' }
  page.nodeOrder.push('svg')
  assert.throws(() => validateArtifactDocument(before))
})

test('SVG subset rejects executable namespaces, encoded attributes and malformed tag boundaries', () => {
  assert.equal(isSafeArtifactSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><path d="M0 0 L10 10" stroke="red"/></g><text>Safe &lt;text&gt;</text></svg>'), true)
  for (const source of [
    '<svg onload="alert(1)"></svg>',
    '<svg><foreignObject><div>HTML</div></foreignObject></svg>',
    '<svg><a href="javascript:alert(1)">x</a></svg>',
    '<svg><path fill="&#117;rl(https://example.com)"/></svg>',
    '<svg><path style="fill:red"/></svg>',
    '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>',
    '<svg><g></svg>',
    '<svg></svg><svg></svg>',
    '<svg><text title="<script>">x</text></svg>',
    '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
    '<svg><path fill="url(https://example.com/image.svg)"/></svg>',
  ]) assert.equal(isSafeArtifactSvg(source), false, source)
})

test('new page and dependent nodes can be submitted atomically', () => {
  const before = createDocument('design', 'canvas')
  const operations = [
    { type: 'page.insert' as const, page: createPage('page') },
    { type: 'node.insert' as const, pageId: 'page', node: createNode('text', 'node') },
    { type: 'node.patch' as const, pageId: 'page', nodeId: 'node', patch: { text: 'Created together' } },
  ]
  const result = applyOperations(before, prepareBatch(before, operations, 'create'))
  assert.equal(result.document.pages.page!.nodes.node!.text, 'Created together')
  const undone = applyOperations(result.document, prepareBatch(result.document, result.inverse, 'undo')).document
  assert.deepEqual(undone.pages, {})
  assert.deepEqual(undone.pageOrder, [])
})

test('reordering conflicts on collection version without conflicting on unrelated text edits', () => {
  const before = fixture()
  before.pages.first!.nodes.second = createNode('text', 'second')
  before.pages.first!.nodeOrder.push('second')
  const reorder = prepareBatch(before, [{ type: 'nodes.reorder', pageId: 'first', nodeIds: ['second', 'title'] }], 'reorder')
  const edit = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'edited' } }], 'edit')
  const edited = applyOperations(before, edit).document
  assert.deepEqual(applyOperations(edited, reorder).document.pages.first!.nodeOrder, ['second', 'title'])
  const inserted = applyOperations(before, prepareBatch(before, [{ type: 'node.insert', pageId: 'first', node: createNode('text', 'third') }], 'insert')).document
  assert.throws(() => applyOperations(inserted, reorder), ArtifactOperationConflict)
})

test('stale group deletion cannot discard newly inserted descendants', () => {
  const before = fixture(), owner = before.pages.first!
  owner.nodes.group = createNode('group', 'group')
  owner.nodeOrder.push('group')
  const deletion = prepareBatch(before, [{ type: 'node.delete', pageId: 'first', nodeId: 'group' }], 'delete-group')
  const child = { ...createNode('text', 'child'), parentId: 'group' }
  const changed = applyOperations(before, prepareBatch(before, [{ type: 'node.insert', pageId: 'first', node: child }], 'insert-child')).document
  assert.throws(() => applyOperations(changed, deletion), ArtifactOperationConflict)
  assert.equal(changed.pages.first!.nodes.child!.parentId, 'group')
})

test('replacement invalidates older patches even for previously absent fields', () => {
  const before = fixture()
  const stale = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { style: { fontSize: 48 } } }], 'old-edit')
  const changed = applyOperations(before, prepareBatch(before, [{ type: 'node.replace', pageId: 'first', nodeId: 'title', node: createNode('shape', 'title') }], 'replace')).document
  assert.throws(() => applyOperations(changed, stale), ArtifactOperationConflict)
})

test('resource deletion conflicts with concurrent new references instead of breaking them', () => {
  const before = fixture()
  before.assets.photo = { id: 'photo', url: '/photo.png', contentType: 'image/png' }
  const deletion = prepareBatch(before, [{ type: 'asset.delete', assetId: 'photo' }], 'delete-asset')
  const insertion = prepareBatch(before, [{ type: 'node.insert', pageId: 'first', node: { ...createNode('image', 'image'), assetId: 'photo' } }], 'insert-image')
  const changed = applyOperations(before, insertion).document
  assert.throws(() => applyOperations(changed, deletion), ArtifactOperationConflict)
  const deleted = applyOperations(before, deletion).document
  assert.throws(() => applyOperations(deleted, insertion), ArtifactOperationConflict)
})

test('flow and paper metadata undo remains lossless through serialized history', () => {
  const before = fixture()
  const result = applyOperations(before, prepareBatch(before, [{ type: 'page.patch', pageId: 'first', patch: { sizing: 'flow', paper: 'A4' } }], 'paper'))
  const inverse = JSON.parse(JSON.stringify(result.inverse))
  const restored = applyOperations(result.document, prepareBatch(result.document, inverse, 'undo-paper')).document
  assert.deepEqual(restored.pages, before.pages)
})

test('theme operations retain exact source resources as inert metadata and undo restores prior theme', () => {
  const before = fixture()
  before.themes.studio = { id: 'studio', name: 'Studio', tokens: { primary: '#123456' } }
  const resources = {
    'tokens.json': '{"primary":"#123456"}\n',
    'styles.css': '@import "retained-source-only.css"; h1 { color: red }\n',
    'templates/cover.html': '<section onclick="alert(1)">保留原始模板<script>retained()</script></section>',
    'reference/layout.md': '# Layout\nUse a quiet cover.\n',
  }
  const theme = { ...before.themes.studio, resources }
  const updated = applyOperations(before, prepareBatch(before, [{ type: 'theme.set', theme }], 'theme-resources'))
  const persisted = validateArtifactDocument(JSON.parse(JSON.stringify(updated.document)))
  assert.deepEqual(persisted.themes.studio!.resources, resources)
  assert.deepEqual(persisted.pages, before.pages, 'retained sources never become native node content')
  const inverse = JSON.parse(JSON.stringify(updated.inverse))
  const restored = applyOperations(persisted, prepareBatch(persisted, inverse, 'undo-theme-resources')).document
  assert.deepEqual(restored.themes, before.themes)
  assert.ok(restored.seq > persisted.seq)
})

test('theme source resources enforce safe paths, file count and UTF-8 byte limits', () => {
  for (const path of ['/styles.css', '../styles.css', 'a/../styles.css', './styles.css', 'a//styles.css', 'a\\styles.css', '%2e%2e/styles.css', 'source.js']) {
    assert.equal(artifactThemeResourcesSchema.safeParse({ [path]: 'source' }).success, false, path)
  }
  assert.equal(artifactThemeResourcesSchema.safeParse(Object.fromEntries(Array.from({ length: 31 }, (_, index) => [`${index}.md`, 'source']))).success, false)
  assert.equal(artifactThemeResourcesSchema.safeParse({ 'large.md': '中'.repeat(700_000) }).success, false, 'per-file limit counts UTF-8 bytes')
  assert.equal(artifactThemeResourcesSchema.safeParse({ 'a.md': '中'.repeat(600_000), 'b.md': '中'.repeat(600_000), 'c.md': '中'.repeat(600_000) }).success, false, 'aggregate source size is bounded')
})

test('plain text edits replace manual rich text, guard both values and undo restores formatting', () => {
  const before = fixture()
  before.pages.first!.nodes.title!.richText = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before', marks: [{ type: 'bold' }] }] }] }
  const batch = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'Agent visible edit' } }], 'plain-text')
  assert.ok(Object.hasOwn(batch.expectedVersions, 'node/first/title/field/richText'))
  const changed = applyOperations(before, batch)
  assert.equal(changed.document.pages.first!.nodes.title!.text, 'Agent visible edit')
  assert.equal(changed.document.pages.first!.nodes.title!.richText, undefined, 'stale rich content cannot hide the new text')
  const restored = applyOperations(changed.document, prepareBatch(changed.document, JSON.parse(JSON.stringify(changed.inverse)), 'undo-text')).document
  assert.deepEqual(restored.pages, before.pages)
  const manual = applyOperations(before, prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Manual changed formatting' }] }] } } }], 'manual-rich')).document
  assert.throws(() => applyOperations(manual, batch), ArtifactOperationConflict)
  const { ['node/first/title/field/richText']: _removed, ...missingRichVersion } = batch.expectedVersions
  assert.throws(() => applyOperations(before, { ...batch, expectedVersions: missingRichVersion }), ArtifactOperationConflict)
})

test('plain text prepared before rich text existed cannot erase a later rich edit', () => {
  const before = fixture()
  const plain = prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { text: 'Old agent edit' } }], 'old-plain')
  const changed = applyOperations(before, prepareBatch(before, [{ type: 'node.patch', pageId: 'first', nodeId: 'title', patch: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fresh formatted text' }] }] } } }], 'fresh-rich')).document
  assert.throws(() => applyOperations(changed, plain), ArtifactOperationConflict)
})

test('retained theme variants change default page, text and shapes with one reversible selection', () => {
  const retained = JSON.parse(readFileSync(new URL('../third_party/baoyu-design/host/builtin-themes.json', import.meta.url), 'utf8')) as Array<{ namespace: string; title: string; tokens: unknown }>
  const slides = JSON.parse(readFileSync(new URL('../third_party/baoyu-design/host/slides-builtin-style.json', import.meta.url), 'utf8')) as { namespace: string; title: string; tokens: unknown }
  const themes = [...retained, slides].flatMap(source => projectArtifactThemes(source.namespace, source.title, source.tokens))
  assert.equal(themes.length, 6)
  const before = fixture()
  before.themes = Object.fromEntries(themes.map(theme => [theme.id, theme]))
  before.themeId = 'baoyu-ember_light'
  const shape = createNode('shape', 'accent')
  before.pages.first!.nodes.accent = shape
  before.pages.first!.nodeOrder.push(shape.id)
  const paint = (document: typeof before) => ({
    background: artifactPageBackground(document.pages.first!, document),
    text: artifactResolvedStyle(document.pages.first!.nodes.title!.style, document).color,
    accent: artifactResolvedStyle(document.pages.first!.nodes.accent!.style, document).fill,
  })
  assert.deepEqual(paint(before), { background: '#fbf7f1', text: '#2b2118', accent: '#c2410c' })
  const changed = applyOperations(before, prepareBatch(before, [{ type: 'document.patch', patch: { themeId: 'baoyu-ember_dark' } }], 'dark-theme'))
  assert.deepEqual(paint(changed.document), { background: '#1d1a17', text: '#f3ece3', accent: '#fb923c' })
  assert.deepEqual(changed.changedPageIds, [], 'theme selection does not rewrite page data')
  const restored = applyOperations(changed.document, prepareBatch(changed.document, JSON.parse(JSON.stringify(changed.inverse)), 'undo-dark-theme')).document
  assert.deepEqual(paint(restored), paint(before))
  assert.ok(restored.seq > changed.document.seq)
  assert.deepEqual(artifactThemeDefaults(before.themes['slides-builtin_light']), { background: '#F5F4ED', text: '#141413', accent: '#D97757', fontFamily: 'system-ui, sans-serif' })
  assert.deepEqual(artifactThemeDefaults(before.themes['baoyu-seazar_high-contrast']), { background: '#ffffff', text: '#000000', accent: '#000000', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' })
})

test('explicit colors remain overrides and resetting page theme binding is reversible', () => {
  const before = fixture()
  before.themes.custom = { id: 'custom', name: 'Custom', tokens: { background: '#101010', text: '#f0f0f0', accent: '#ff8800', 'font.sans': 'Georgia, serif' } }
  before.themeId = 'custom'
  const style = { ...before.pages.first!.nodes.title!.style, color: '#123456', fill: '#654321', themeFill: 'accent', fontFamily: 'Custom Font' }
  assert.deepEqual(artifactResolvedStyle(style, before), style, 'authored values remain stable across theme selection')
  assert.equal(artifactResolvedStyle(createNode('text', 'new').style, before).fontFamily, 'Georgia, serif')
  const batch = prepareBatch(before, [{ type: 'page.patch', pageId: 'first', patch: { background: '#ffeedd' } }], 'custom-background')
  assert.ok(Object.hasOwn(batch.expectedVersions, 'page/first/field/themeBackground'))
  const result = applyOperations(before, batch)
  assert.equal(result.document.pages.first!.themeBackground, undefined, 'plain background edits override theme binding')
  assert.equal(artifactPageBackground(result.document.pages.first!, result.document), '#ffeedd')
  const restored = applyOperations(result.document, prepareBatch(result.document, JSON.parse(JSON.stringify(result.inverse)), 'undo-background')).document
  assert.equal(artifactPageBackground(restored.pages.first!, restored), '#101010')
  assert.deepEqual(restored.pages, before.pages)
})

test('theme style helpers reject executable token strings and unresolved aliases', () => {
  const before = fixture()
  before.themes.unsafe = { id: 'unsafe', name: 'Unsafe values', tokens: { background: 'url(https://example.invalid/track)', text: '<script>', accent: '{accent}', 'font.sans': 'font; color:red' } }
  before.themeId = 'unsafe'
  assert.deepEqual(artifactThemeDefaults(before.themes.unsafe), { background: '#ffffff', text: '#222222', accent: '#d6e6ff', fontFamily: 'sans-serif' })
  assert.equal(artifactPageBackground(before.pages.first!, before), '#ffffff')
  assert.equal(artifactResolvedStyle(createNode('shape', 'shape').style, before).fill, '#d6e6ff')
})

test('设计播放属性经保存重开、字段版本和共享撤销重做保留，旧快照不变',()=>{
  let document=createDocument('design','playback');const page=createPage('board','画板');document.pages[page.id]=page;document.pageOrder=[page.id]
  const before=JSON.stringify(document),batch=prepareBatch(document,[{type:'page.patch',pageId:page.id,patch:{interactive:true,frameless:true}}]),applied=applyOperations(document,batch)
  const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(applied.document)))
  assert.equal(reopened.pages.board!.interactive,true);assert.equal(reopened.pages.board!.frameless,true);assert.equal(JSON.stringify(document),before)
  for(const field of ['interactive','frameless']){assert.equal(batch.expectedVersions[`page/board/field/${field}`],0);assert.equal(reopened.versions[`page/board/field/${field}`],reopened.seq)}
  const undo=applyOperations(reopened,prepareBatch(reopened,applied.inverse));assert.equal(undo.document.pages.board!.interactive,undefined);assert.equal(undo.document.pages.board!.frameless,undefined)
  document=applyOperations(undo.document,prepareBatch(undo.document,undo.inverse)).document;assert.equal(document.pages.board!.interactive,true);assert.equal(document.pages.board!.frameless,true)
})

test('打印模式与画板增长独立，保存重开、共享历史及字段冲突保持原尺寸',()=>{
  const before=fixture(),original=JSON.stringify(before)
  before.pages.first!.sizing='flow'
  const fixed=applyOperations(before,prepareBatch(before,[{type:'page.patch',pageId:'first',patch:{print:'fixed',paper:'A4'}}],'print-fixed'))
  const page=validateArtifactDocument(JSON.parse(JSON.stringify(fixed.document))).pages.first!
  assert.equal(page.print,'fixed');assert.equal(page.sizing,'flow');assert.equal(page.paper,'A4')
  assert.deepEqual([page.width,page.height],[before.pages.first!.width,before.pages.first!.height])
  const undo=applyOperations(fixed.document,prepareBatch(fixed.document,JSON.parse(JSON.stringify(fixed.inverse)),'undo-print'))
  assert.deepEqual(undo.document.pages,before.pages)
  const removal=prepareBatch(fixed.document,[{type:'page.patch',pageId:'first',patch:{},unset:['print']}],'remove-print')
  const other=applyOperations(fixed.document,prepareBatch(fixed.document,[{type:'page.patch',pageId:'first',patch:{height:240}}],'resize'))
  assert.equal(applyOperations(other.document,removal).document.pages.first!.print,undefined)
  const changed=applyOperations(fixed.document,prepareBatch(fixed.document,[{type:'page.patch',pageId:'first',patch:{print:'flow'}}],'remote-print'))
  assert.throws(()=>applyOperations(changed.document,removal),ArtifactOperationConflict)
  const old=JSON.parse(original);assert.equal(Object.hasOwn(validateArtifactDocument(old).pages.first!,'print'),false)
})
