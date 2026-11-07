import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { Pool } from 'pg'
import { createNode, createPage } from '../../../shared/artifact-document.js'
import { duplicatePages } from '../../../shared/artifact-editor-actions.js'
import { type ArtifactOperation, prepareBatch } from '../../../shared/artifact-operations.js'
import { withTransaction } from '../db/transaction.js'
import { artifactKind } from '../modules/artifacts/kinds.js'
import {
  ensureNativeDocument, initializeNativeArtifact, legacyConversionText, nativeDocumentChanges, nativeOperationReceipt,
  nativeSourceArchive, readNativeDocument, readNativeOriginal, readNativeOriginalBlob, readNativeOriginalResource, readNativePage, readNativePageSnapshot, restoreNativeRevision, submitNativeOperations, submitNativeRename,
} from '../modules/artifacts/native-document.js'
import type { ArtifactRow } from '../modules/artifacts/repository-types.js'
import { listing, publish, readProjectFile, sha256 } from '../modules/artifacts/store.js'
import { installStorageProvider, type Storage } from '../storage.js'

// Real PostgreSQL transactions exercise the document service independently of model/runtime availability.
// The owning full migration test checks the same additive DDL against the complete product schema.
const schema = `native_documents_${randomUUID().replaceAll('-', '')}`
let db: Pool, admin: Pool
before(async () => {
  const url = new URL(process.env.INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '')
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  assert.match(url.pathname, /_test$/)
  assert.equal(url.search, '')
  admin = new Pool({ connectionString: url.toString(), max: 1 })
  await admin.query(`CREATE SCHEMA ${schema}`)
  db = new Pool({ connectionString: url.toString(), max: 4, options: `-c search_path=${schema}` })
  await db.query(`CREATE TABLE users(id text PRIMARY KEY);
    CREATE TABLE artifacts(id text PRIMARY KEY,company_id text NOT NULL,project_id text NOT NULL DEFAULT 'project',
      kind text NOT NULL,title text NOT NULL,created_by text NOT NULL,seq bigint NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now());
    CREATE TABLE artifact_files(artifact_id text REFERENCES artifacts(id) ON DELETE CASCADE,path text,sha256 text,size integer,
      content_type text,body bytea,updated_by text,updated_at timestamptz DEFAULT now(),PRIMARY KEY(artifact_id,path));
    CREATE TABLE artifact_file_versions(artifact_id text REFERENCES artifacts(id) ON DELETE CASCADE,sha256 text,body bytea,PRIMARY KEY(artifact_id,sha256));
    CREATE TABLE artifact_revisions(artifact_id text REFERENCES artifacts(id) ON DELETE CASCADE,seq bigint,version text,files jsonb,actor_id text,
      created_at timestamptz DEFAULT now(),PRIMARY KEY(artifact_id,seq));
    CREATE TABLE artifact_blobs(artifact_id text REFERENCES artifacts(id) ON DELETE CASCADE,id text,sha256 text,size bigint,content_type text,storage_key text,PRIMARY KEY(artifact_id,id));
    CREATE TABLE slide_editor_contexts(artifact_id text,user_id text,context jsonb,updated_at timestamptz DEFAULT now());`)
  await withTransaction(db, async client => { await client.query(await readFile(new URL('../db/migrations/0063_native_artifact_documents.sql', import.meta.url), 'utf8')) })
})
after(async () => {
  await db?.end()
  if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end() }
})

async function artifact(kind: 'slides' | 'design' = 'slides', native = true) {
  const id = `test-${randomUUID()}`
  return withTransaction(db, async client => {
    const row = (await client.query<ArtifactRow>('INSERT INTO artifacts(id,company_id,kind,title,created_by) VALUES($1,\'company\',$2,\'Document\',\'human\') RETURNING *', [id, kind])).rows[0]
    if (native) await initializeNativeArtifact(client, row, 'human')
    return row
  })
}
const snapshot = async (id: string) => (await readNativeDocument(db, id))!
const apply = (id: string, request: unknown, actorKind: 'user' | 'agent' = 'user') => withTransaction(db, client => submitNativeOperations(client, {
  artifactId: id, companyId: 'company', actorId: actorKind === 'user' ? 'human' : 'agent', actorKind, request,
}))
async function withText() {
  const item = await artifact()
  const initial = await snapshot(item.id), node = createNode('text', 'title')
  node.text = 'Original'
  await apply(item.id, prepareBatch(initial.document, [{ type: 'node.insert', pageId: 'page-1', node }], 'insert-title'))
  return item
}

test('50 image and formula pages persist by changed page and reopen at their immutable snapshot', async () => {
  const item = await artifact(), initial = await snapshot(item.id)
  const operations: ArtifactOperation[] = [{ type: 'page.delete', pageId: 'page-1' }]
  for (let number = 1; number <= 50; number++) {
    const asset = { id: `image-${number}`, url: `/fixtures/image-${number}.png`, contentType: 'image/png', sha256: sha256(`image-${number}`) }
    const page = createPage(`page-${number}`)
    const title = { ...createNode('text', 'title'), text: `Page ${number} 中文` }
    const image = { ...createNode('image', 'image'), assetId: asset.id }
    const formula = { ...createNode('math', 'formula'), source: String.raw`\frac{x_${number}}{\sqrt{2}}` }
    page.nodeOrder = ['title', 'image', 'formula']; page.nodes = { title, image, formula }
    operations.push({ type: 'asset.set', asset }, { type: 'page.insert', page })
  }
  const saved = await apply(item.id, prepareBatch(initial.document, operations, 'fifty-pages'), 'agent')
  assert.equal(saved.document.pageOrder.length, 50)
  assert.equal(Object.keys(saved.pageVersions).length, 50)
  const beforeHash = saved.pageVersions['page-25']
  const edited = await apply(item.id, prepareBatch(saved.document, [{ type: 'node.patch', pageId: 'page-25', nodeId: 'title', patch: { text: 'Human edit' } }], 'edit-middle'))
  assert.deepEqual(edited.changedPageIds, ['page-25'])
  for (const id of saved.document.pageOrder.filter(id => id !== 'page-25')) assert.equal(edited.pageVersions[id], saved.pageVersions[id])
  assert.equal((await readNativePage(db, item.id, 'page-25', beforeHash))?.nodes.title.text, 'Page 25 中文')
  const pinned = await readNativePageSnapshot(db, item.id, 'page-25', beforeHash, saved.document.seq)
  assert.equal(pinned?.seq, saved.document.seq)
  assert.equal(pinned?.page.nodes.title.text, 'Page 25 中文')
  assert.ok(Object.keys(pinned!.versions).every(key => !key.startsWith('node/page-24/')))
  assert.equal(pinned?.versions['page/page-25/exists'], saved.document.versions['page/page-25/exists'])
  assert.equal(await readNativePageSnapshot(db, item.id, 'page-25', beforeHash, edited.document.seq), null)
  assert.equal((await snapshot(item.id)).document.pages['page-25'].nodes.title.text, 'Human edit')
  assert.equal((await snapshot(item.id)).document.pages['page-50'].nodes.formula.source, String.raw`\frac{x_50}{\sqrt{2}}`)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM artifact_files WHERE artifact_id=$1', [item.id])).rows[0].count, 51)
})

test('native Slides manifest and page reads are allowed without opening legacy file writes', async () => {
  const item = await withText(), before = await snapshot(item.id), definition = artifactKind('slides')
  const manifest = await readProjectFile(db, definition, item.id, 'project/document.json')
  assert.equal(JSON.parse(manifest!.toString()).schemaVersion, 1)
  assert.equal(JSON.parse(manifest!.toString()).pageFiles['page-1'], before.pageVersions['page-1'])
  const page = await readProjectFile(db, definition, item.id, 'project/pages/page-1.json')
  assert.equal(JSON.parse(page!.toString()).nodes.title.text, 'Original')
  for (const path of ['project/pages/../document.json', 'project/pages/nested/page.json', 'project/pages/.hidden.json']) {
    assert.equal(await readProjectFile(db, definition, item.id, path), null)
  }
  const rejected = await withTransaction(db, client => publish(client, definition, item.id, {
    'project/slides/legacy.html': { base64: Buffer.from('<h1>Retired write</h1>').toString('base64'), contentType: 'text/html', ifMatch: null },
  }, 'human'))
  assert.equal(rejected.status, 409); assert.equal(rejected.body.code, 'editor_upgrade_required')
  assert.deepEqual((await snapshot(item.id)).document, before.document)
})

test('independent fields merge, same-field conflicts are atomic, and retry receipts are durable', async () => {
  const item = await withText(), original = await snapshot(item.id)
  const human = prepareBatch(original.document, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { text: 'Human' } }], 'human-title')
  const agent = prepareBatch(original.document, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { style: { color: '#ff0000' } } }], 'agent-color')
  await apply(item.id, human)
  const merged = await apply(item.id, agent, 'agent')
  assert.equal(merged.document.pages['page-1'].nodes.title.text, 'Human')
  assert.equal(merged.document.pages['page-1'].nodes.title.style.color, '#ff0000')
  const conflict = prepareBatch(original.document, [
    { type: 'document.patch', patch: { title: 'Must not change' } },
    { type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { text: 'Stale agent text' } },
  ], 'conflicting-batch')
  await assert.rejects(apply(item.id, conflict, 'agent'), { status: 409, code: 'version_conflict' })
  assert.equal((await snapshot(item.id)).document.title, 'Document')
  assert.equal(await nativeOperationReceipt(db, item.id, 'conflicting-batch'), null)
  const retry = await apply(item.id, human)
  assert.equal(retry.deduplicated, true)
  assert.equal(retry.committedSeq, (await nativeOperationReceipt(db, item.id, human.operationId))?.seq)
  assert.equal(retry.document.seq, merged.document.seq)
  await assert.rejects(apply(item.id, { ...human, baseSeq: merged.document.seq }), { code: 'operation_id_reused' })
})

test('shared undo/redo includes Agent transactions and refuses a stale second client', async () => {
  const item = await withText(), current = await snapshot(item.id)
  const edited = await apply(item.id, prepareBatch(current.document, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { text: 'Agent step' } }], 'agent-step'), 'agent')
  const undo = { operationId: 'undo-a', kind: 'undo', targetOperationId: 'agent-step', expectedHistoryVersion: edited.history.version }
  const undone = await apply(item.id, undo)
  assert.equal(undone.document.pages['page-1'].nodes.title.text, 'Original')
  assert.ok(undone.document.seq > edited.document.seq)
  await assert.rejects(apply(item.id, { ...undo, operationId: 'undo-b' }), { code: 'history_conflict' })
  const redone = await apply(item.id, { operationId: 'redo-a', kind: 'redo', targetOperationId: 'agent-step', expectedHistoryVersion: undone.history.version })
  assert.equal(redone.document.pages['page-1'].nodes.title.text, 'Agent step')
  const removed = await apply(item.id, { operationId: 'undo-again', kind: 'undo', targetOperationId: 'agent-step', expectedHistoryVersion: redone.history.version })
  const newer = await apply(item.id, prepareBatch(removed.document, [{ type: 'document.patch', patch: { title: 'New branch' } }], 'new-edit'))
  assert.equal(newer.history.redo, null)
  const changes = await nativeDocumentChanges(db, item.id, edited.document.seq)
  assert.deepEqual(changes.items.map(change => change.kind), ['undo', 'redo', 'undo', 'edit'])
})

test('native files reject old editor publishes and retain tenant scope', async () => {
  const item = await withText()
  const blocked = await withTransaction(db, client => publish(client, artifactKind('slides'), item.id, {
    'project/deck.json': { base64: Buffer.from('{}').toString('base64'), contentType: 'application/json' },
  }, 'human'))
  assert.equal(blocked.status, 409); assert.equal(blocked.body.code, 'editor_upgrade_required')
  const current = await snapshot(item.id)
  await assert.rejects(withTransaction(db, client => submitNativeOperations(client, { artifactId: item.id, companyId: 'other-company', actorId: 'human', actorKind: 'user',
    request: prepareBatch(current.document, [{ type: 'document.patch', patch: { title: 'Unauthorized' } }]) })), { status: 404 })
})

test('the title endpoint adapter keeps the observed version and stable retry payload', async () => {
  const item = await withText(), opened = await snapshot(item.id)
  const originalVersion = opened.document.versions['document/title'] ?? 0
  const agent = await apply(item.id, prepareBatch(opened.document, [{ type: 'document.patch', patch: { title: 'Agent title' } }], 'agent-rename'), 'agent')
  const rename = (operationId?: string, expectedVersion?: number) => withTransaction(db, client => submitNativeRename(client,
    { artifactId: item.id, companyId: 'company', actorId: 'human', title: 'Human title', operationId, expectedVersion }))
  await assert.rejects(rename(), { code: 'version_required' })
  await assert.rejects(rename('stale-rename', originalVersion), { code: 'version_conflict' })
  assert.equal((await snapshot(item.id)).document.title, 'Agent title')
  const saved = await rename('human-rename', agent.document.versions['document/title'])
  await apply(item.id, prepareBatch(saved.document, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'title', patch: { x: 150 } }], 'unrelated-edit'))
  const retry = await rename('human-rename', agent.document.versions['document/title'])
  assert.equal(retry.deduplicated, true)
  assert.equal(retry.committedSeq, saved.committedSeq)
  assert.equal(retry.document.title, 'Human title')
})

test('legacy conversion projects textual formats but never decodes known binary assets as UTF-8', () => {
  const text = Buffer.from('中文 <source> with exact bytes')
  for (const extension of ['html', 'xhtml', 'jsx', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'jsonc', 'css', 'scss', 'less', 'svg', 'md', 'xml']) {
    assert.equal(legacyConversionText(`project/source.${extension}`, 'application/octet-stream', text), text.toString('utf8'), extension)
  }
  assert.equal(legacyConversionText('project/vector', 'image/svg+xml; charset=utf-8', text), text.toString('utf8'))
  assert.equal(legacyConversionText('project/source', 'text/plain', text), text.toString('utf8'))
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff])
  Object.defineProperty(binary, 'toString', { value: () => { throw new Error('binary assets must not be decoded for conversion') } })
  for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'pdf', 'zip', 'mp3', 'mp4']) {
    assert.equal(legacyConversionText(`project/asset.${extension}`, 'application/octet-stream', binary), '', extension)
  }
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'font/woff2', 'application/font-woff', 'application/vnd.ms-fontobject', 'application/octet-stream', 'application/pdf', 'audio/mpeg', 'video/mp4']) {
    assert.equal(legacyConversionText('project/asset', mime, binary), '', mime)
  }
})

test('stored legacy PNGs convert to immutable original URLs without isolating surrounding text and x-embed content', async () => {
  const item = await artifact('slides', false)
  const imagePath = 'project/ds/fixture/pixel.png', pagePath = 'project/slides/cover.html'
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX9sAAAAASUVORK5CYII=', 'base64')
  const imageHash = sha256(png)
  assert.notDeepEqual(Buffer.from(png.toString('utf8'), 'utf8'), png, 'the stored image is binary, not lossless UTF-8 text')
  const isolated = '<!doctype html><html><head><meta charset="utf-8"><style>button{color:teal}</style></head><body><button id="count">0</button><script>document.querySelector("button").onclick=event=>event.target.textContent="1"</script></body></html>'
  const source = `<section id="cover"><h1 id="title">Editable original 中文</h1><img id="canonical-image" src="${imagePath}" width="1" height="1"><img id="relative-image" src="../ds/fixture/pixel.png" width="1" height="1"><x-embed style="position:absolute;left:200px;top:200px;width:320px;height:200px">${isolated}</x-embed></section>`
  const files = {
    'project/deck.json': { bytes: Buffer.from(JSON.stringify({ v: 4, title: 'Binary image import', order: ['cover'] })), contentType: 'application/json' },
    [pagePath]: { bytes: Buffer.from(source), contentType: 'text/html' },
    [imagePath]: { bytes: png, contentType: 'image/png' },
  }
  const published = await withTransaction(db, client => publish(client, artifactKind('slides'), item.id,
    Object.fromEntries(Object.entries(files).map(([path, file]) => [path, { base64: file.bytes.toString('base64'), contentType: file.contentType, ifMatch: null }])), 'human'))
  assert.equal(published.status, 200)
  const stored = (await db.query<{ body: Buffer; content_type: string; sha256: string }>('SELECT body,content_type,sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [item.id, imagePath])).rows[0]
  assert.ok(Buffer.isBuffer(stored.body))
  assert.deepEqual(stored.body, png)
  assert.equal(stored.sha256, imageHash)
  assert.equal(stored.content_type, 'image/png')

  const context = { db, transaction: <T>(run: (client: import('../db/queryable.js').Queryable) => Promise<T>) => withTransaction(db, run) }
  const converted = await ensureNativeDocument(context, { artifactId: item.id, companyId: 'company', actorId: 'human', write: true })
  const page = converted.document.pages.cover
  const nodes = Object.values(page.nodes), images = nodes.filter(node => node.type === 'image'), embeds = nodes.filter(node => node.type === 'embed')
  assert.equal(page.nodes.title.type, 'text')
  assert.equal(page.nodes.title.text, 'Editable original 中文')
  assert.equal(images.length, 2, 'both canonical and page-relative stored image references become image nodes')
  assert.equal(embeds.length, 1, 'executable content stays inside its own block')
  assert.equal(embeds[0].embed?.source, isolated, 'x-embed source is preserved byte-for-byte without absorbing the page')
  assert.equal(embeds[0].embed?.sourceHash, sha256(isolated))
  assert.equal(embeds[0].embed?.originalPath, pagePath)
  assert.equal(Object.keys(converted.document.assets).length, 1, 'both paths identify the same immutable asset')
  for (const node of images) {
    const asset = converted.document.assets[node.assetId!]
    assert.equal(asset.url, `/api/artifacts/${item.id}/originals/${imageHash}/${imagePath}`)
    assert.equal(asset.contentType, 'image/png')
    assert.equal(asset.sha256, imageHash)
  }
  assert.deepEqual(converted.original?.files[imagePath], { sha256: imageHash, size: png.length, contentType: 'image/png' })
  const original = await readNativeOriginal(db, item.id, imageHash, imagePath)
  assert.ok(original)
  assert.deepEqual(original.bytes, png)
  assert.equal(original.contentType, 'image/png')
  assert.equal(sha256(original.bytes), imageHash)

  await apply(item.id, prepareBatch(converted.document, [{ type: 'node.patch', pageId: page.id, nodeId: 'title', patch: { text: 'Edited native title' } }], 'edit-imported-binary-page'))
  assert.equal((await snapshot(item.id)).document.pages.cover.nodes.title.text, 'Edited native title')
  const currentVersion = (await listing(db, item.id)).ver
  const restored = await withTransaction(db, client => restoreNativeRevision(client, {
    artifactId: item.id, companyId: 'company', actorId: 'human', seq: String((published.body as { seq: number }).seq), version: currentVersion,
  }))
  assert.equal(restored.document.pages.cover.nodes.title.text, 'Editable original 中文')
  assert.equal(Object.values(restored.document.pages.cover.nodes).filter(node => node.type === 'image').length, 2)
  assert.equal(Object.values(restored.document.pages.cover.nodes).find(node => node.type === 'embed')?.embed?.source, isolated)
  assert.equal(Object.values(restored.document.assets)[0].url, `/api/artifacts/${item.id}/originals/${imageHash}/${imagePath}`)
  assert.deepEqual(restored.original, converted.original)
  for (const [path, file] of Object.entries(files)) {
    const retained = await readNativeOriginal(db, item.id, sha256(file.bytes), path)
    assert.ok(retained)
    assert.deepEqual(retained.bytes, file.bytes, `${path}: native edits must leave the original bytes unchanged`)
    assert.equal(retained.contentType, file.contentType)
    assert.equal(sha256(retained.bytes), sha256(file.bytes))
  }
})

test('old source converts without rewriting originals and retained checkpoints restore through native history', async () => {
  const item = await artifact('slides', false)
  const originalImage = Buffer.from('fixed original image bytes'), blobId = '0123456789abcdef0123456789abcdef'
  const storageKey = `artifacts/${item.id}/assets/${blobId}.png`
  installStorageProvider({ mode: 'r2', async readObjectBounded(key: string) { assert.equal(key, storageKey); return originalImage } } as unknown as Storage)
  await db.query('INSERT INTO artifact_blobs(artifact_id,id,sha256,size,content_type,storage_key) VALUES($1,$2,$3,$4,\'image/png\',$5)', [item.id, blobId, sha256(originalImage), originalImage.length, storageKey])
  const sourceFiles = { 'project/deck.json': JSON.stringify({ v: 4, title: 'Original deck', order: ['cover'] }),
    'project/slides/cover.html': '<section id="cover"><h1 id="title">Original title</h1><p>中文 $x^2$</p></section>',
    'project/ds/reference/styles.css': 'h1{color:#224466}' }
  await withTransaction(db, client => publish(client, artifactKind('slides'), item.id, Object.fromEntries(Object.entries(sourceFiles).map(([path, content]) => [path,
    { base64: Buffer.from(content).toString('base64'), contentType: 'text/plain', ifMatch: null }])), 'human'))
  const context = { db, transaction: <T>(run: (client: import('../db/queryable.js').Queryable) => Promise<T>) => withTransaction(db, run) }
  const readOnly = await ensureNativeDocument(context, { artifactId: item.id, companyId: 'company', actorId: 'human', write: false })
  assert.ok(readOnly.document.pageOrder.length)
  assert.equal(await readNativeDocument(db, item.id), null, 'readers cannot migrate persistent state')
  const converted = await ensureNativeDocument(context, { artifactId: item.id, companyId: 'company', actorId: 'human', write: true })
  for (const [path, content] of Object.entries(sourceFiles)) assert.equal((await readNativeOriginal(db, item.id, sha256(content), path))?.bytes.toString('utf8'), content)
  assert.deepEqual((await readNativeOriginalBlob(db, item.id, blobId))?.bytes, originalImage)
  assert.equal(converted.original?.blobs?.[blobId].sha256, sha256(originalImage))
  assert.equal((await readNativeOriginalResource(db, item.id, converted.original!.version, 'project/ds/reference/styles.css'))?.bytes.toString('utf8'), sourceFiles['project/ds/reference/styles.css'])
  const archive = await nativeSourceArchive(db, item.id)
  assert.equal(archive.assets[blobId].base64, originalImage.toString('base64'))
  assert.equal(archive.assets[blobId].sha256, sha256(originalImage))
  const edited = await apply(item.id, prepareBatch(converted.document, [{ type: 'document.patch', patch: { title: 'Changed title' } }], 'change-converted'))
  assert.equal(edited.history.undo, 'change-converted')
  const currentVersion = (await listing(db, item.id)).ver
  const restored = await withTransaction(db, client => restoreNativeRevision(client, { artifactId: item.id, companyId: 'company', actorId: 'human', seq: String(converted.document.seq), version: currentVersion }))
  assert.equal(restored.document.title, converted.document.title)
  assert.ok(restored.document.seq > edited.document.seq)
  for (const [path, content] of Object.entries(sourceFiles)) assert.equal((await readNativeOriginal(db, item.id, sha256(content), path))?.bytes.toString('utf8'), content)
})

test('restoring a historical PNG resolves its exact recorded image without changing the first-conversion originals', async () => {
  const item = await artifact('slides', false), imagePath = 'project/ds/fixture/pixel.png', pagePath = 'project/slides/cover.html'
  const oldImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX9sAAAAASUVORK5CYII=', 'base64')
  const latestImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  const publishVersion = async (label: string, image: Buffer) => {
    const current = await listing(db, item.id)
    const source = `<section id="cover"><h1 id="title">${label}</h1><img id="photo" src="${imagePath}"></section>`
    const files = {
      'project/deck.json': { bytes: Buffer.from(JSON.stringify({ v: 4, title: label, order: ['cover'] })), contentType: 'application/json' },
      [pagePath]: { bytes: Buffer.from(source), contentType: 'text/html' },
      [imagePath]: { bytes: image, contentType: 'image/png' },
    }
    const result = await withTransaction(db, client => publish(client, artifactKind('slides'), item.id,
      Object.fromEntries(Object.entries(files).map(([path, file]) => [path, { base64: file.bytes.toString('base64'), contentType: file.contentType, ifMatch: current.files[path]?.sha256 ?? null }])), 'human'))
    assert.equal(result.status, 200)
    return { seq: String((result.body as { seq: number }).seq), files }
  }
  const old = await publishVersion('Historical page', oldImage)
  const latest = await publishVersion('First conversion page', latestImage)
  assert.notEqual(sha256(oldImage), sha256(latestImage))
  const context = { db, transaction: <T>(run: (client: import('../db/queryable.js').Queryable) => Promise<T>) => withTransaction(db, run) }
  const converted = await ensureNativeDocument(context, { artifactId: item.id, companyId: 'company', actorId: 'human', write: true })
  const currentVersion = (await listing(db, item.id)).ver
  const restored = await withTransaction(db, client => restoreNativeRevision(client, { artifactId: item.id, companyId: 'company', actorId: 'human', seq: old.seq, version: currentVersion }))
  assert.equal(restored.document.pages.cover.nodes.title.text, 'Historical page')
  assert.deepEqual(restored.original, converted.original)
  assert.equal(restored.original?.files[imagePath].sha256, sha256(latestImage))
  const asset = restored.document.assets[restored.document.pages.cover.nodes.photo.assetId!]
  assert.equal(asset.url, `/api/artifacts/${item.id}/originals/${sha256(oldImage)}/${imagePath}`)
  const image = await readNativeOriginal(db, item.id, sha256(oldImage), imagePath)
  assert.ok(image, 'the restored image URL must resolve its historical PNG')
  assert.deepEqual(image.bytes, oldImage)
  assert.equal(image.contentType, 'image/png')
  assert.equal(sha256(image.bytes), asset.sha256)
  for (const [path, file] of Object.entries(latest.files)) {
    const original = await readNativeOriginal(db, item.id, sha256(file.bytes), path)
    assert.deepEqual(original?.bytes, file.bytes, 'first-conversion source bytes remain unchanged')
  }
  assert.equal(await readNativeOriginal(db, item.id, sha256(oldImage), 'project/ds/other.png'), null)
  assert.equal(await readNativeOriginal(db, item.id, sha256('unknown image'), imagePath), null)
  assert.equal(await readNativeOriginal(db, item.id, sha256(old.files[pagePath].bytes), pagePath), null, 'historical executable/text sources do not gain an originals alias')
  const unrelated = await artifact('slides')
  assert.equal(await readNativeOriginal(db, unrelated.id, sha256(oldImage), imagePath), null)
  const unindexed = Buffer.concat([oldImage, Buffer.from('not a recorded checkpoint')])
  await db.query('INSERT INTO artifact_file_versions(artifact_id,sha256,body) VALUES($1,$2,$3)', [item.id, sha256(unindexed), unindexed])
  assert.equal(await readNativeOriginal(db, item.id, sha256(unindexed), imagePath), null, 'a stored blob hash alone does not authorize a source path')
  const archive = await nativeSourceArchive(db, item.id)
  assert.equal(archive.originals[imagePath].base64, latestImage.toString('base64'))
  assert.equal(archive.originals[imagePath].sha256, sha256(latestImage))
})

test('restored legacy embeds retain their checkpoint resources without changing original conversion files', async () => {
  const item = await artifact('slides', false)
  const cssPath = 'project/ds/reference/theme.css'
  const legacy = async (label: string) => {
    const before = await listing(db, item.id)
    const files = { 'project/deck.json': JSON.stringify({ v: 4, title: label, order: ['cover'] }),
      'project/slides/cover.html': `<link rel="stylesheet" href="../ds/reference/theme.css"><h1>${label}</h1><script>document.body.dataset.version='${label}'</script>`,
      [cssPath]: `h1{--checkpoint:${label}}` }
    const outcome = await withTransaction(db, client => publish(client, artifactKind('slides'), item.id,
      Object.fromEntries(Object.entries(files).map(([path, content]) => [path, { base64: Buffer.from(content).toString('base64'), contentType: 'text/plain', ifMatch: before.files[path]?.sha256 ?? null }])), 'human'))
    assert.equal(outcome.status, 200)
    return { seq: String((outcome.body as { seq: number }).seq), version: (await listing(db, item.id)).ver }
  }
  const old = await legacy('A')
  const latest = await legacy('B')
  const context = { db, transaction: <T>(run: (client: import('../db/queryable.js').Queryable) => Promise<T>) => withTransaction(db, run) }
  const converted = await ensureNativeDocument(context, { artifactId: item.id, companyId: 'company', actorId: 'human', write: true })
  assert.equal(converted.original?.version, latest.version)
  const currentVersion = (await listing(db, item.id)).ver
  const restored = await withTransaction(db, client => restoreNativeRevision(client, { artifactId: item.id, companyId: 'company', actorId: 'human', seq: old.seq, version: currentVersion }))
  assert.equal(restored.original?.version, latest.version)
  const page = restored.document.pages[restored.document.pageOrder[0]]
  const embed = Object.values(page.nodes).find(node => node.embed)?.embed
  assert.equal(embed?.resourceVersion, old.version)
  assert.match(embed?.source ?? '', /<h1>A<\/h1>/)
  assert.equal((await readNativeOriginalResource(db, item.id, old.version, cssPath))?.bytes.toString(), 'h1{--checkpoint:A}')
  assert.equal((await readNativeOriginalResource(db, item.id, latest.version, cssPath))?.bytes.toString(), 'h1{--checkpoint:B}')
  assert.equal(await readNativeOriginalResource(db, 'another-artifact', old.version, cssPath), null)
})

test('an Agent legacy source token cannot migrate or overwrite a newer source', async () => {
  const item = await artifact('slides', false)
  const path = 'project/deck.json'
  const write = async (title: string) => {
    const current = (await listing(db, item.id)).files[path]
    const outcome = await withTransaction(db, client => publish(client, artifactKind('slides'), item.id, { [path]: {
      base64: Buffer.from(JSON.stringify({ v: 4, title, order: [] })).toString('base64'), contentType: 'application/json', ifMatch: current?.sha256 ?? null,
    } }, 'human'))
    assert.equal(outcome.status, 200)
  }
  const context = { db, transaction: <T>(run: (client: import('../db/queryable.js').Queryable) => Promise<T>) => withTransaction(db, run) }
  const input = { artifactId: item.id, companyId: 'company', actorId: 'human', write: false }
  await write('Observed old source')
  const old = await ensureNativeDocument(context, input)
  await write('Latest source')
  for (const write of [false, true]) await assert.rejects(ensureNativeDocument(context, { ...input, write, expectedSourceVersion: old.original!.version }), { code: 'source_conflict' })
  assert.equal(await readNativeDocument(db, item.id), null)
  const latest = await ensureNativeDocument(context, input)
  const converted = await ensureNativeDocument(context, { ...input, write: true, expectedSourceVersion: latest.original!.version })
  assert.equal(converted.original?.version, latest.original!.version)
  await assert.rejects(ensureNativeDocument(context, { ...input, write: true, expectedSourceVersion: old.original!.version }), { code: 'source_conflict' })
  assert.equal((await ensureNativeDocument(context, { ...input, expectedSourceVersion: latest.original!.version })).document.seq, converted.document.seq)
})

test('an export can read its pinned embed page after a later Agent edit', async () => {
  const item = await artifact(), before = await snapshot(item.id)
  const node = { ...createNode('embed', 'isolated'), embed: { source: '<h1>Export snapshot</h1>', format: 'html' as const } }
  const saved = await apply(item.id, prepareBatch(before.document, [{ type: 'node.insert', pageId: 'page-1', node }], 'embed-insert'))
  await apply(item.id, prepareBatch(saved.document, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'isolated', patch: { embed: { source: '<h1>Agent changed</h1>', format: 'html' } } }], 'embed-change'), 'agent')
  const old = await readNativePage(db, item.id, 'page-1', saved.pageVersions['page-1'])
  assert.equal(old?.nodes.isolated.embed?.source, '<h1>Export snapshot</h1>')
  assert.equal(old?.nodes.isolated.embed?.sourceHash, sha256('<h1>Export snapshot</h1>'))
})

test('unknown schema remains read-only and no operation can silently downgrade it', async () => {
  const item = await artifact('design'), current = await snapshot(item.id)
  await db.query('UPDATE artifact_document_state SET schema_version=2 WHERE artifact_id=$1', [item.id])
  await assert.rejects(readNativeDocument(db, item.id), { code: 'unsupported_schema' })
  await assert.rejects(apply(item.id, prepareBatch(current.document, [{ type: 'document.patch', patch: { title: 'Wrong version' } }])), { code: 'unsupported_schema' })
})


test('设计播放属性真实持久化、复制与撤销重做，并保留历史页哈希', async () => {
  const item=await artifact('design'),initial=await snapshot(item.id),before=JSON.stringify(initial.document)
  const edited=await apply(item.id,prepareBatch(initial.document,[{type:'page.patch',pageId:'page-1',patch:{interactive:true,frameless:true}}],'playback-flags'))
  const reopened=await snapshot(item.id)
  assert.equal(reopened.document.pages['page-1'].interactive,true);assert.equal(reopened.document.pages['page-1'].frameless,true)
  assert.notEqual(reopened.pageVersions['page-1'],initial.pageVersions['page-1']);assert.equal(JSON.stringify(initial.document),before)
  const pinned=await readNativePageSnapshot(db,item.id,'page-1',initial.pageVersions['page-1'],initial.document.seq)
  assert.equal(pinned?.page.interactive,undefined);assert.equal(pinned?.page.frameless,undefined)
  const undone=await apply(item.id,{operationId:'undo-playback-flags',kind:'undo',targetOperationId:'playback-flags',expectedHistoryVersion:edited.history.version})
  assert.equal(undone.document.pages['page-1'].interactive,undefined);assert.equal(undone.document.pages['page-1'].frameless,undefined)
  const redone=await apply(item.id,{operationId:'redo-playback-flags',kind:'redo',targetOperationId:'playback-flags',expectedHistoryVersion:undone.history.version})
  assert.equal(redone.document.pages['page-1'].interactive,true);assert.equal(redone.document.pages['page-1'].frameless,true)
  let next=0;const copied=await apply(item.id,prepareBatch(redone.document,duplicatePages(redone.document,['page-1'],()=>`playback-copy-${++next}`),'copy-playback-board'))
  const duplicate=copied.document.pages[copied.document.pageOrder[1]]
  assert.equal(duplicate.interactive,true);assert.equal(duplicate.frameless,true)
})

test('幻灯片神奇移动身份与转场真实持久化，复制可编辑并保留历史页哈希', async () => {
  const item=await artifact('slides'),initial=await snapshot(item.id)
  const node={...createNode('text','motion-heading'),text:'移动标题'}
  const edited=await apply(item.id,prepareBatch(initial.document,[{type:'page.patch',pageId:'page-1',patch:{transition:'magic'}},{type:'node.insert',pageId:'page-1',node}],'slide-motion'))
  let next=0
  const copied=await apply(item.id,prepareBatch(edited.document,duplicatePages(edited.document,['page-1'],()=>`slide-motion-${++next}`),'copy-motion'))
  const copyId=copied.document.pageOrder[1],copy=copied.document.pages[copyId],paired=Object.values(copy.nodes).find(node=>node.motionId==='motion-heading')!
  assert.ok(paired);assert.notEqual(paired.id,node.id);assert.equal(copy.transition,'magic')
  const moved=await apply(item.id,prepareBatch(copied.document,[{type:'node.patch',pageId:copyId,nodeId:paired.id,patch:{x:200}},{type:'page.patch',pageId:copyId,patch:{transition:'push'}}],'move-motion'))
  const reopened=await snapshot(item.id)
  assert.equal(reopened.document.pages[copyId].nodes[paired.id].motionId,node.id);assert.equal(reopened.document.pages[copyId].nodes[paired.id].x,200);assert.equal(reopened.document.pages[copyId].transition,'push')
  assert.equal(reopened.pageVersions['page-1'],edited.pageVersions['page-1'])
  const pinned=await readNativePageSnapshot(db,item.id,copyId,copied.pageVersions[copyId],copied.document.seq)
  assert.equal(pinned?.page.nodes[paired.id].x,node.x);assert.equal(pinned?.page.transition,'magic')
  const undone=await apply(item.id,{operationId:'undo-move-motion',kind:'undo',targetOperationId:'move-motion',expectedHistoryVersion:moved.history.version})
  assert.equal(undone.document.pages[copyId].transition,'magic');assert.equal(undone.document.pages[copyId].nodes[paired.id].x,node.x)
  const redone=await apply(item.id,{operationId:'redo-move-motion',kind:'redo',targetOperationId:'move-motion',expectedHistoryVersion:undone.history.version})
  assert.equal(redone.document.pages[copyId].transition,'push');assert.equal(redone.document.pages[copyId].nodes[paired.id].motionId,node.id)
  const identity=await apply(item.id,prepareBatch(redone.document,[{type:'node.patch',pageId:'page-1',nodeId:node.id,patch:{motionId:'renamed-motion'}}],'set-first-motion-id'))
  const clear=await apply(item.id,{operationId:'undo-first-motion-id',kind:'undo',targetOperationId:'set-first-motion-id',expectedHistoryVersion:identity.history.version})
  assert.equal(clear.document.pages['page-1'].nodes[node.id].motionId,undefined)
  const restore=await apply(item.id,{operationId:'redo-first-motion-id',kind:'redo',targetOperationId:'set-first-motion-id',expectedHistoryVersion:clear.history.version})
  assert.equal(restore.document.pages['page-1'].nodes[node.id].motionId,'renamed-motion')
  const unset=await apply(item.id,prepareBatch(restore.document,[{type:'node.patch',pageId:'page-1',nodeId:node.id,patch:{},unset:['motionId']}],'unset-motion-id'))
  assert.equal((await snapshot(item.id)).document.pages['page-1'].nodes[node.id].motionId,undefined)
  const restored=await apply(item.id,{operationId:'undo-unset-motion-id',kind:'undo',targetOperationId:'unset-motion-id',expectedHistoryVersion:unset.history.version})
  assert.equal(restored.document.pages['page-1'].nodes[node.id].motionId,'renamed-motion')
})

test('画板四角持久化到不可变页快照、共享历史和页面副本',async()=>{
  const item=await artifact('design'),initial=await snapshot(item.id),oldHash=initial.pageVersions['page-1']
  const old=await readNativePage(db,item.id,'page-1',oldHash),oldBytes=JSON.stringify(old)
  const request=prepareBatch(initial.document,[{type:'page.patch',pageId:'page-1',patch:{radius:[10,20,30,40]}}],'radius')
  const saved=await apply(item.id,request)
  assert.deepEqual((await snapshot(item.id)).document.pages['page-1'].radius,[10,20,30,40])
  assert.deepEqual((await readNativePage(db,item.id,'page-1',saved.pageVersions['page-1']))?.radius,[10,20,30,40])
  assert.equal(JSON.stringify(await readNativePage(db,item.id,'page-1',oldHash)),oldBytes)
  assert.equal((await apply(item.id,request)).deduplicated,true)
  const undone=await apply(item.id,{operationId:'undo-radius',kind:'undo',targetOperationId:'radius',expectedHistoryVersion:saved.history.version})
  assert.equal(Object.hasOwn(undone.document.pages['page-1'],'radius'),false)
  const redone=await apply(item.id,{operationId:'redo-radius',kind:'redo',targetOperationId:'radius',expectedHistoryVersion:undone.history.version})
  assert.deepEqual(redone.document.pages['page-1'].radius,[10,20,30,40])
  const copy=await apply(item.id,prepareBatch(redone.document,duplicatePages(redone.document,['page-1'],()=> 'radius-copy'),'copy-radius'))
  assert.deepEqual(copy.document.pages['radius-copy'].radius,[10,20,30,40])
  assert.equal(JSON.stringify(await readNativePage(db,item.id,'page-1',oldHash)),oldBytes)
})

test('画板打印设置独立持久化、撤销重做与复制，旧页快照不变',async()=>{
  const item=await artifact('design'),initial=await snapshot(item.id),page=initial.document.pages['page-1'],oldHash=initial.pageVersions['page-1'],oldBytes=JSON.stringify(await readNativePage(db,item.id,'page-1',oldHash))
  const request=prepareBatch(initial.document,[{type:'page.patch',pageId:'page-1',patch:{print:'flow',paper:'A4'}}],'print-settings')
  const saved=await apply(item.id,request),reopened=(await snapshot(item.id)).document.pages['page-1']
  assert.equal(reopened.print,'flow');assert.equal(reopened.paper,'A4');assert.equal(reopened.sizing,page.sizing)
  assert.deepEqual([reopened.width,reopened.height],[page.width,page.height]);assert.deepEqual(reopened.nodes,page.nodes)
  assert.equal((await readNativePage(db,item.id,'page-1',saved.pageVersions['page-1']))?.print,'flow')
  assert.equal((await apply(item.id,request)).deduplicated,true)
  const undone=await apply(item.id,{operationId:'undo-print',kind:'undo',targetOperationId:'print-settings',expectedHistoryVersion:saved.history.version})
  assert.equal(Object.hasOwn(undone.document.pages['page-1'],'print'),false)
  const redone=await apply(item.id,{operationId:'redo-print',kind:'redo',targetOperationId:'print-settings',expectedHistoryVersion:undone.history.version})
  const copied=await apply(item.id,prepareBatch(redone.document,duplicatePages(redone.document,['page-1'],()=> 'print-copy'),'copy-print'))
  assert.equal(copied.document.pages['print-copy'].print,'flow');assert.equal(copied.document.pages['print-copy'].paper,'A4')
  assert.equal(JSON.stringify(await readNativePage(db,item.id,'page-1',oldHash)),oldBytes)
})
