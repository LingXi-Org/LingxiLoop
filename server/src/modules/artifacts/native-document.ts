import { createHash, randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { type ArtifactDocument, type ArtifactPage, artifactPageSchema, createDocument, createPage, validateArtifactDocument } from '../../../../shared/artifact-document.js'
import { type ArtifactOperation, type ArtifactOperationBatch, applyOperations, prepareBatch } from '../../../../shared/artifact-operations.js'
import { projectArtifactThemes } from '../../../../shared/artifact-themes.js'
import type { Queryable } from '../../db/queryable.js'
import { storage } from '../../storage.js'
import { artifactKind } from './kinds.js'
import { advanceNativeHistory, historyView, type NativeHistoryState } from './native-history.js'
import type { ArtifactRow } from './repository-types.js'
import { type ListedFile, listing, sha256 } from './store.js'

export const NATIVE_DOCUMENT_PATH = 'project/document.json'
export const nativePagePath = (pageId: string) => `project/pages/${pageId}.json`
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
interface OriginalBlob { sha256: string; size: number; contentType: string; storageKey: string }
interface OriginalManifest { version: string; files: Record<string, ListedFile>; warnings: string[]; blobs?: Record<string, OriginalBlob> }
interface StateRow {
  schema_version: number; revision: string | number; history_version: string | number
  undo_stack: string[]; redo_stack: string[]; original_manifest: OriginalManifest | null
}
interface Manifest extends Omit<ArtifactDocument, 'pages'> { pageFiles: Record<string, string> }
export interface NativeDocumentSnapshot {
  document: ArtifactDocument
  history: ReturnType<typeof historyView>
  pageVersions: Record<string, string>
  original?: OriginalManifest
}
export interface StoredOperationReceipt {
  operationId: string; seq: number; kind: 'edit' | 'undo' | 'redo' | 'restore' | 'convert'
  actorId: string; actorKind: 'user' | 'agent'; operations: ArtifactOperation[]
  changedPageIds: string[]; changedKeys: string[]; history: ReturnType<typeof historyView>
}
export interface NativeOperationResult extends NativeDocumentSnapshot {
  operationId: string; seq: number; committedSeq: number; changedPageIds: string[]; deduplicated: boolean
}
export class NativeDocumentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message) }
}
export const nativeWritesEnabled = () => process.env.NATIVE_ARTIFACT_WRITES_ENABLED === 'true'
  || process.env.NODE_ENV !== 'production' && process.env.NATIVE_ARTIFACT_WRITES_ENABLED !== 'false'
function assertNativeWrites() {
  if (!nativeWritesEnabled()) throw new NativeDocumentError(503, 'editor_upgrade_pending', 'Editor upgrade is in progress. Your draft is retained; retry after the upgrade.')
}
const stateHistory = (state: StateRow): NativeHistoryState => ({ version: Number(state.history_version), undo: state.undo_stack, redo: state.redo_stack })
const encode = (value: unknown) => Buffer.from(JSON.stringify(value) + '\n')
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
const requestHash = (request: unknown) => createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex')
const historyRequest = z.object({ operationId: z.string().min(1).max(240), kind: z.enum(['undo', 'redo']),
  targetOperationId: z.string().min(1).max(240), expectedHistoryVersion: z.number().int().nonnegative().safe() }).strict()

async function scopedArtifact(db: Queryable, artifactId: string, companyId?: string, lock = false): Promise<ArtifactRow> {
  const row = (await db.query<ArtifactRow>(`SELECT * FROM artifacts WHERE id=$1 AND ($2::text IS NULL OR company_id=$2)${lock ? ' FOR UPDATE' : ''}`, [artifactId, companyId ?? null])).rows[0]
  if (!row) throw new NativeDocumentError(404, 'not_found', 'Artifact not found')
  return row
}

/** Manifest and history come from one database snapshot; pages are then read by immutable hash. */
export async function readNativeDocument(db: Queryable, artifactId: string): Promise<NativeDocumentSnapshot | null> {
  const row = (await db.query<StateRow & { body: Buffer }>(`SELECT state.schema_version,state.revision,state.history_version,
    state.undo_stack,state.redo_stack,state.original_manifest,file.body FROM artifact_document_state state
    JOIN artifact_files file ON file.artifact_id=state.artifact_id AND file.path=$2 WHERE state.artifact_id=$1`, [artifactId, NATIVE_DOCUMENT_PATH])).rows[0]
  if (!row) return null
  if (row.schema_version !== 1) throw new NativeDocumentError(422, 'unsupported_schema', 'This document requires a newer editor. Download the original document to preserve it.')
  const manifest = JSON.parse(row.body.toString('utf8')) as Manifest
  const { pageFiles, ...metadata } = manifest
  const contents = await versionContents(db, artifactId, Object.values(pageFiles))
  const pages: Record<string, ArtifactPage> = {}
  for (const pageId of manifest.pageOrder) {
    const bytes = contents.get(pageFiles[pageId])
    if (!bytes) throw new NativeDocumentError(500, 'missing_page', `Saved page ${pageId} is unavailable`)
    pages[pageId] = artifactPageSchema.parse(JSON.parse(bytes.toString('utf8')))
  }
  const document = validateArtifactDocument({ ...metadata, pages })
  if (document.seq !== Number(row.revision)) throw new NativeDocumentError(500, 'invalid_revision', 'Saved document revision is inconsistent')
  return { document, history: historyView(stateHistory(row)), pageVersions: pageFiles, ...(row.original_manifest ? { original: row.original_manifest } : {}) }
}

async function versionContents(db: Queryable, artifactId: string, hashes: string[]) {
  if (!hashes.length) return new Map<string, Buffer>()
  const rows = (await db.query<{ sha256: string; body: Buffer }>('SELECT sha256,body FROM artifact_file_versions WHERE artifact_id=$1 AND sha256=ANY($2::text[])', [artifactId, hashes])).rows
  return new Map(rows.map(row => [row.sha256, row.body]))
}

export async function readNativePage(db: Queryable, artifactId: string, pageId: string, hash?: string): Promise<ArtifactPage | null> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pageId)) return null
  if (hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) return null
    // Hash access remains artifact-scoped; ensure it was actually a version of this page.
    const checkpoint = await db.query('SELECT 1 FROM artifact_revisions WHERE artifact_id=$1 AND files->$2->>\'sha256\'=$3 LIMIT 1', [artifactId, nativePagePath(pageId), hash])
    if (!checkpoint.rows.length) return null
    const bytes = (await versionContents(db, artifactId, [hash])).get(hash)
    const page = bytes ? artifactPageSchema.parse(JSON.parse(bytes.toString('utf8'))) : null
    return page?.id === pageId ? page : null
  }
  return (await readNativeDocument(db, artifactId))?.document.pages[pageId] ?? null
}

export const pageVersionsOf = (versions: Record<string, number>, pageId: string) => Object.fromEntries(Object.entries(versions).filter(([key]) =>
  key === `page/${pageId}` || key.startsWith(`page/${pageId}/`) || key.startsWith(`node/${pageId}/`)
  || key.startsWith('document/') || key.startsWith('theme/') || key.startsWith('asset/')))

/** A compact Agent read keeps its page and CAS tokens on the same immutable document revision. */
export async function readNativePageSnapshot(db: Queryable, artifactId: string, pageId: string, hash?: string, atSeq?: number) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pageId) || hash !== undefined && !/^[a-f0-9]{64}$/.test(hash)) return null
  if (atSeq === undefined && hash === undefined) {
    const current = await readNativeDocument(db, artifactId)
    const page = current?.document.pages[pageId]
    return page && current ? { page, version: current.pageVersions[pageId], seq: current.document.seq, versions: pageVersionsOf(current.document.versions, pageId) } : null
  }
  const revision = (await db.query<{ files: Record<string, ListedFile> }>(`SELECT files FROM artifact_revisions WHERE artifact_id=$1
    AND ($2::bigint IS NULL OR seq=$2) AND ($3::text IS NULL OR files->$4->>'sha256'=$3) ORDER BY seq DESC LIMIT 1`,
  [artifactId, atSeq ?? null, hash ?? null, nativePagePath(pageId)])).rows[0]
  const manifestHash = revision?.files[NATIVE_DOCUMENT_PATH]?.sha256
  if (!manifestHash) return null
  const bytes = (await versionContents(db, artifactId, [manifestHash])).get(manifestHash)
  if (!bytes) throw new NativeDocumentError(500, 'missing_revision', 'Snapshot manifest is unavailable')
  const manifest = JSON.parse(bytes.toString('utf8')) as Manifest
  if (manifest.schemaVersion !== 1) throw new NativeDocumentError(422, 'unsupported_schema', 'This snapshot requires a newer editor.')
  const pageHash = manifest.pageFiles[pageId]
  if (!pageHash || hash !== undefined && hash !== pageHash) return null
  const pageBytes = (await versionContents(db, artifactId, [pageHash])).get(pageHash)
  if (!pageBytes) throw new NativeDocumentError(500, 'missing_revision', 'Snapshot page is unavailable')
  return { page: artifactPageSchema.parse(JSON.parse(pageBytes.toString('utf8'))), version: pageHash, seq: manifest.seq, versions: pageVersionsOf(manifest.versions, pageId) }
}

async function writeNativeFile(db: Queryable, artifactId: string, path: string, bytes: Buffer, actorId: string) {
  const hash = sha256(bytes)
  await db.query(`INSERT INTO artifact_file_versions(artifact_id,sha256,body) VALUES($1,$2,$3) ON CONFLICT(artifact_id,sha256) DO NOTHING`, [artifactId, hash, bytes])
  await db.query(`INSERT INTO artifact_files(artifact_id,path,sha256,size,content_type,body,updated_by)
    VALUES($1,$2,$3,$4,'application/json',$5,$6) ON CONFLICT(artifact_id,path) DO UPDATE SET
    sha256=EXCLUDED.sha256,size=EXCLUDED.size,content_type=EXCLUDED.content_type,body=EXCLUDED.body,updated_by=EXCLUDED.updated_by,updated_at=now()`,
  [artifactId, path, hash, bytes.length, bytes, actorId])
  return hash
}

/** Internal writer: normal file publishing is deliberately unable to enter this path. */
async function persistDocument(db: Queryable, document: ArtifactDocument, actorId: string, previous: NativeDocumentSnapshot | null, changedPageIds: string[]) {
  const pageFiles = { ...previous?.pageVersions }
  for (const id of changedPageIds) {
    const page = document.pages[id]
    if (page) pageFiles[id] = await writeNativeFile(db, document.id, nativePagePath(id), encode(page), actorId)
    else {
      delete pageFiles[id]
      await db.query('DELETE FROM artifact_files WHERE artifact_id=$1 AND path=$2', [document.id, nativePagePath(id)])
    }
  }
  const { pages: _pages, ...metadata } = document
  const manifest = encode({ ...metadata, pageFiles } satisfies Manifest)
  if (manifest.length > MAX_DOCUMENT_BYTES) throw new NativeDocumentError(413, 'too_large', 'Document metadata exceeds the supported size')
  await writeNativeFile(db, document.id, NATIVE_DOCUMENT_PATH, manifest, actorId)
  await db.query('UPDATE artifacts SET seq=$2,title=$3,updated_at=now() WHERE id=$1', [document.id, document.seq, document.title.slice(0, 200)])
  await db.query('UPDATE artifact_document_state SET revision=$2,updated_at=now() WHERE artifact_id=$1', [document.id, document.seq])
  const files = await listing(db, document.id)
  await db.query(`INSERT INTO artifact_revisions(artifact_id,seq,version,files,actor_id) VALUES($1,$2,$3,$4::jsonb,$5)
    ON CONFLICT(artifact_id,seq) DO NOTHING`, [document.id, document.seq, files.ver, JSON.stringify(files.files), actorId])
  return pageFiles
}

function stampEmbeddedSources(document: ArtifactDocument, pageIds: string[]) {
  for (const id of pageIds) for (const node of Object.values(document.pages[id]?.nodes ?? {})) {
    if (node.embed) node.embed.sourceHash = sha256(node.embed.source)
  }
}

function stampLegacyResources(document: ArtifactDocument, version: string) {
  for (const page of Object.values(document.pages)) for (const node of Object.values(page.nodes)) {
    if (node.embed?.originalPath) node.embed.resourceVersion = version
  }
}

function initialDocument(artifact: ArtifactRow) {
  const document = createDocument(artifact.kind, artifact.id, artifact.title)
  const page = createPage('page-1', artifact.kind === 'slides' ? '第 1 页' : '画板 1')
  document.pageOrder = [page.id]
  document.pages[page.id] = page
  // Preserve the installed baoyu theme tokens while projecting scalar tokens for native rendering.
  const definition = artifactKind(artifact.kind)
  const source = definition.initialIndex(artifact.title, new Date().toISOString())
  const systems = Array.isArray(source.designSystems) ? source.designSystems as Array<{ namespace: string; title: string; version?: string; artifact?: string }> : []
  for (const system of systems) {
    const raw = definition.initialResources?.[`project/ds/${system.namespace}/tokens.json`]
    for (const theme of projectArtifactThemes(system.namespace, system.title, raw, { version: system.version, url: system.artifact })) document.themes[theme.id] = theme
  }
  document.themeId = Object.keys(document.themes)[0] ?? null
  return document
}

/** Called in the artifact creation transaction; a new document never loads a legacy converter. */
export async function initializeNativeArtifact(db: Queryable, artifact: ArtifactRow, actorId: string) {
  assertNativeWrites()
  const document = initialDocument(artifact)
  document.seq = Number(artifact.seq ?? 0) + 1
  await db.query('INSERT INTO artifact_document_state(artifact_id,revision) VALUES($1,$2)', [artifact.id, document.seq])
  await persistDocument(db, document, actorId, null, document.pageOrder)
  return (await readNativeDocument(db, artifact.id))!
}

interface SourceSnapshot { artifact: ArtifactRow; version: string; files: Record<string, { content: string; sha256: string }>; listing: Record<string, ListedFile>; blobs: Record<string, OriginalBlob> }
/** Conversion needs text sources and asset identities; original binary bytes stay in storage. */
export function legacyConversionText(path: string, contentType: string, bytes: Buffer): string {
  if (/\.(?:html?|xhtml|jsx?|tsx?|mjs|cjs|jsonc?|css|scss|less|svg|txt|md|markdown|ya?ml|xml|csv|tsv)$/i.test(path)) return bytes.toString('utf8')
  const mime = contentType.split(';', 1)[0].trim().toLowerCase()
  if (/\.(?:png|jpe?g|webp|gif|avif|apng|bmp|ico|tiff?|heic|heif|woff2?|ttf|otf|eot|pdf|zip|gz|br|mp[34]|webm|ogg|wav|flac|mov)$/i.test(path)
    || /^(?:image\/(?!svg\+xml$)|font\/|audio\/|video\/)/.test(mime)
    || /^(?:application\/(?:octet-stream|pdf|zip|gzip|font-[\w-]+|x-font-[\w-]+|vnd\.ms-fontobject))$/.test(mime)) return ''
  return bytes.toString('utf8')
}
async function legacySource(db: Queryable, artifactId: string, companyId: string): Promise<SourceSnapshot> {
  const artifact = await scopedArtifact(db, artifactId, companyId)
  const rows = (await db.query<{ path: string; sha256: string; size: number; content_type: string; body: Buffer }>('SELECT path,sha256,size,content_type,body FROM artifact_files WHERE artifact_id=$1 ORDER BY path COLLATE "C"', [artifactId])).rows
  const files: SourceSnapshot['files'] = {}, listed: Record<string, ListedFile> = {}
  for (const row of rows) { files[row.path] = { content: legacyConversionText(row.path, row.content_type, row.body), sha256: row.sha256 }; listed[row.path] = { sha256: row.sha256, size: Number(row.size), contentType: row.content_type } }
  return { artifact, version: 'local-' + sha256(rows.map(row => `${row.path}:${row.sha256}`).join('\n')).slice(0, 16), files, listing: listed, blobs: await nativeBlobManifest(db, artifactId) }
}

async function nativeBlobManifest(db: Queryable, artifactId: string): Promise<Record<string, OriginalBlob>> {
  const rows = (await db.query<{ id: string; sha256: string; size: string | number; content_type: string; storage_key: string }>('SELECT id,sha256,size,content_type,storage_key FROM artifact_blobs WHERE artifact_id=$1', [artifactId])).rows
  return Object.fromEntries(rows.map(row => [row.id, { sha256: row.sha256, size: Number(row.size), contentType: row.content_type, storageKey: row.storage_key }]))
}

interface Conversion { document: ArtifactDocument; warnings: string[]; originals: Record<string, string> }
function convertInWorker(source: Pick<SourceSnapshot, 'artifact' | 'files'>): Promise<Conversion> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./native-conversion-worker.mjs', import.meta.url), { workerData: {
      id: source.artifact.id, kind: source.artifact.kind, title: source.artifact.title, files: source.files,
    } })
    const timeout = setTimeout(() => { void worker.terminate(); reject(new NativeDocumentError(504, 'conversion_timeout', 'Document conversion timed out. The original files are unchanged.')) }, 30_000)
    worker.once('message', (result: { result?: Conversion; error?: string }) => {
      clearTimeout(timeout)
      if (result.result) resolve(result.result)
      else reject(new NativeDocumentError(422, 'conversion_failed', result.error ?? '无法转换此稿件，原始文件未更改。'))
      void worker.terminate()
    })
    worker.once('error', error => { clearTimeout(timeout); reject(error) })
    worker.once('exit', code => { clearTimeout(timeout); if (code !== 0) reject(new NativeDocumentError(422, 'conversion_failed', 'Document conversion could not finish. The original files are unchanged.')) })
  })
}

/** Read-only readers get an ephemeral conversion; only authorized writers can commit the native format. */
export async function ensureNativeDocument(context: { db: Queryable; transaction: Transaction }, input: { artifactId: string; companyId: string; actorId: string; write: boolean; expectedSourceVersion?: string }): Promise<NativeDocumentSnapshot> {
  const assertSource = (version: string | undefined) => {
    if (input.expectedSourceVersion !== undefined && input.expectedSourceVersion !== version) throw new NativeDocumentError(409, 'source_conflict', 'The original document changed. Read its latest source before editing.', { sourceVersion: version ?? null })
  }
  await scopedArtifact(context.db, input.artifactId, input.companyId)
  const current = await readNativeDocument(context.db, input.artifactId)
  if (current) { assertSource(current.original?.version); return current }
  const source = await legacySource(context.db, input.artifactId, input.companyId)
  assertSource(source.version)
  const converted = await convertInWorker(source)
  const document = validateArtifactDocument(converted.document)
  if (Buffer.byteLength(JSON.stringify(document)) > MAX_DOCUMENT_BYTES) throw new NativeDocumentError(413, 'too_large', 'Converted document exceeds the supported size. Its original files are unchanged.')
  stampEmbeddedSources(document, document.pageOrder)
  stampLegacyResources(document, source.version)
  const original = { version: source.version, files: source.listing, warnings: converted.warnings, blobs: source.blobs }
  if (!input.write || !nativeWritesEnabled()) return { document, history: { version: 0, undo: null, redo: null }, pageVersions: {}, original }
  return context.transaction(async db => {
    const artifact = await scopedArtifact(db, input.artifactId, input.companyId, true)
    const existing = await readNativeDocument(db, input.artifactId)
    if (existing) { assertSource(existing.original?.version); return existing }
    if ((await listing(db, input.artifactId)).ver !== source.version) throw new NativeDocumentError(409, 'conversion_conflict', 'The original document changed while converting. Reopen the document to convert its latest version.')
    await db.query(`INSERT INTO artifact_file_versions(artifact_id,sha256,body) SELECT artifact_id,sha256,body FROM artifact_files
      WHERE artifact_id=$1 ON CONFLICT(artifact_id,sha256) DO NOTHING`, [input.artifactId])
    document.seq = Number(artifact.seq) + 1
    await db.query('INSERT INTO artifact_document_state(artifact_id,revision,original_manifest) VALUES($1,$2,$3::jsonb)', [input.artifactId, document.seq, JSON.stringify(original)])
    await persistDocument(db, document, input.actorId, null, document.pageOrder)
    const receipt: StoredOperationReceipt = { operationId: `convert-${source.version}`, seq: document.seq, kind: 'convert', actorId: input.actorId, actorKind: 'user', operations: [], changedPageIds: document.pageOrder, changedKeys: [], history: { version: 0, undo: null, redo: null } }
    await saveOperation(db, input.artifactId, receipt, requestHash({ sourceVersion: source.version }), [], null)
    return (await readNativeDocument(db, input.artifactId))!
  })
}

async function saveOperation(db: Queryable, artifactId: string, receipt: StoredOperationReceipt, hash: string, inverse: ArtifactOperation[], targetId: string | null) {
  await db.query(`INSERT INTO artifact_operations(artifact_id,seq,operation_id,request_hash,actor_id,actor_kind,kind,target_operation_id,operations,inverse_operations,result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
  [artifactId, receipt.seq, receipt.operationId, hash, receipt.actorId, receipt.actorKind, receipt.kind, targetId, JSON.stringify(receipt.operations), JSON.stringify(inverse), JSON.stringify(receipt)])
}

export async function nativeOperationReceipt(db: Queryable, artifactId: string, operationId: string): Promise<StoredOperationReceipt | null> {
  return (await db.query<{ result: StoredOperationReceipt }>('SELECT result FROM artifact_operations WHERE artifact_id=$1 AND operation_id=$2', [artifactId, operationId])).rows[0]?.result ?? null
}

/** The legacy title endpoint is a narrow operation adapter, never a server-fabricated fresh CAS. */
export function submitNativeRename(db: Queryable, input: { artifactId: string; companyId: string; actorId: string; title: string; operationId?: string; expectedVersion?: number }) {
  if (!input.operationId || input.expectedVersion === undefined) throw new NativeDocumentError(409, 'version_required', 'Read the document title version before renaming it. Your entered title has not been saved.')
  return submitNativeOperations(db, { artifactId: input.artifactId, companyId: input.companyId, actorId: input.actorId, actorKind: 'user',
    request: { operationId: input.operationId, baseSeq: input.expectedVersion, expectedVersions: { 'document/title': input.expectedVersion },
      operations: [{ type: 'document.patch', patch: { title: input.title.trim().slice(0, 200) } }] } })
}

/** Caller owns the transaction and authorization. Every human and Agent edit uses this single reducer and writer. */
export async function submitNativeOperations(db: Queryable, input: { artifactId: string; companyId: string; actorId: string; actorKind: 'user' | 'agent'; request: unknown; kind?: 'restore' }): Promise<NativeOperationResult> {
  assertNativeWrites()
  await scopedArtifact(db, input.artifactId, input.companyId, true)
  const current = await readNativeDocument(db, input.artifactId)
  if (!current) throw new NativeDocumentError(409, 'native_document_required', 'Open this document in the new editor before editing.')
  const raw = input.request as { operationId?: unknown; kind?: unknown }
  const operationId = z.string().min(1).max(240).parse(raw?.operationId)
  const hash = requestHash(input.request)
  const prior = (await db.query<{ request_hash: string; result: StoredOperationReceipt }>('SELECT request_hash,result FROM artifact_operations WHERE artifact_id=$1 AND operation_id=$2', [input.artifactId, operationId])).rows[0]
  if (prior) {
    if (prior.request_hash !== hash) throw new NativeDocumentError(409, 'operation_id_reused', 'An operation ID cannot be reused with different content.')
    return { ...current, operationId, seq: current.document.seq, committedSeq: prior.result.seq, changedPageIds: prior.result.changedPageIds, deduplicated: true }
  }
  const state = (await db.query<StateRow>('SELECT * FROM artifact_document_state WHERE artifact_id=$1', [input.artifactId])).rows[0]!
  let batch: ArtifactOperationBatch, history: NativeHistoryState, kind: StoredOperationReceipt['kind'] = input.kind ?? 'edit', targetId: string | null = null
  if (raw.kind === 'undo' || raw.kind === 'redo') {
    const command = historyRequest.parse(input.request)
    history = advanceNativeHistory(stateHistory(state), command)
    const target = (await db.query<{ operations: ArtifactOperation[]; inverse_operations: ArtifactOperation[] }>('SELECT operations,inverse_operations FROM artifact_operations WHERE artifact_id=$1 AND operation_id=$2', [input.artifactId, command.targetOperationId])).rows[0]
    if (!target) throw new NativeDocumentError(409, 'history_unavailable', 'This history step is unavailable.')
    batch = prepareBatch(current.document, command.kind === 'undo' ? target.inverse_operations : target.operations, operationId)
    kind = command.kind; targetId = command.targetOperationId
  } else {
    batch = input.request as ArtifactOperationBatch
    history = advanceNativeHistory(stateHistory(state), { kind: input.kind ?? 'edit', operationId })
  }
  let applied: ReturnType<typeof applyOperations>
  try { applied = applyOperations(current.document, batch) }
  catch (error) {
    if (error && typeof error === 'object' && 'conflicts' in error) throw new NativeDocumentError(409, 'version_conflict', 'Some edited fields changed. Your pending changes have not been saved.', { conflicts: error.conflicts, snapshot: current })
    if (error instanceof z.ZodError) throw error
    throw new NativeDocumentError(400, 'invalid_operation', error instanceof Error ? error.message : 'Invalid document operation')
  }
  if (Buffer.byteLength(JSON.stringify(applied.document)) > MAX_DOCUMENT_BYTES) throw new NativeDocumentError(413, 'too_large', 'Document exceeds the supported size')
  stampEmbeddedSources(applied.document, applied.changedPageIds)
  const pageVersions = await persistDocument(db, applied.document, input.actorId, current, applied.changedPageIds)
  await db.query('UPDATE artifact_document_state SET history_version=$2,undo_stack=$3::jsonb,redo_stack=$4::jsonb WHERE artifact_id=$1',
    [input.artifactId, history.version, JSON.stringify(history.undo), JSON.stringify(history.redo)])
  const receipt: StoredOperationReceipt = { operationId, seq: applied.document.seq, kind, actorId: input.actorId, actorKind: input.actorKind,
    operations: batch.operations, changedPageIds: applied.changedPageIds, changedKeys: applied.changedKeys, history: historyView(history) }
  await saveOperation(db, input.artifactId, receipt, hash, applied.inverse, targetId)
  return { document: applied.document, history: receipt.history, pageVersions, ...(current.original ? { original: current.original } : {}),
    operationId, seq: applied.document.seq, committedSeq: applied.document.seq, changedPageIds: applied.changedPageIds, deduplicated: false }
}

export async function nativeDocumentChanges(db: Queryable, artifactId: string, afterSeq: number) {
  const items = (await db.query<{ result: StoredOperationReceipt }>('SELECT result FROM artifact_operations WHERE artifact_id=$1 AND seq>$2 ORDER BY seq LIMIT 200', [artifactId, afterSeq])).rows.map(row => row.result)
  const state = (await db.query<{ revision: string }>('SELECT revision FROM artifact_document_state WHERE artifact_id=$1', [artifactId])).rows[0]
  return { items, seq: items.at(-1)?.seq ?? afterSeq, latestSeq: Number(state?.revision ?? 0), hasMore: items.length === 200 }
}

export async function readNativeOriginal(db: Queryable, artifactId: string, hash: string, path: string) {
  const state = (await db.query<{ original_manifest: OriginalManifest | null }>('SELECT original_manifest FROM artifact_document_state WHERE artifact_id=$1', [artifactId])).rows[0]
  if (!state) {
    const source = (await db.query<{ body: Buffer; content_type: string }>('SELECT body,content_type FROM artifact_files WHERE artifact_id=$1 AND path=$2 AND sha256=$3', [artifactId, path, hash])).rows[0]
    return source ? { bytes: source.body, contentType: source.content_type } : null
  }
  let file = state.original_manifest?.files[path]
  if (!file || file.sha256 !== hash) {
    // A restored image can predate the immutable first-conversion manifest.
    // Require its exact path/hash in this artifact's retained legacy checkpoint;
    // content-addressed storage alone must never authorize a resource URL.
    const historical = (await db.query<{ file: ListedFile }>(`SELECT files->$2::text AS file FROM artifact_revisions
      WHERE artifact_id=$1 AND files->$2::text->>'sha256'=$3 AND NOT (files ? $4)
      ORDER BY seq DESC LIMIT 1`, [artifactId, path, hash, NATIVE_DOCUMENT_PATH])).rows[0]?.file
    if (!historical || !/^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/.test(historical.contentType.split(';', 1)[0].trim().toLowerCase())) return null
    file = historical
  }
  const bytes = (await versionContents(db, artifactId, [hash])).get(hash)
  return bytes ? { bytes, contentType: file.contentType } : null
}

export async function readNativeOriginalResource(db: Queryable, artifactId: string, version: string, path: string) {
  const state = (await db.query<{ original_manifest: OriginalManifest | null }>('SELECT original_manifest FROM artifact_document_state WHERE artifact_id=$1', [artifactId])).rows[0]
  if (state?.original_manifest?.version === version) {
    const file = state.original_manifest.files[path]
    return file ? readNativeOriginal(db, artifactId, file.sha256, path) : null
  }
  // Restored legacy pages retain their own checkpoint's CSS, components and media.
  // The initial conversion manifest remains immutable and is not a resource alias.
  const checkpoint = (await db.query<{ files: Record<string, ListedFile> }>('SELECT files FROM artifact_revisions WHERE artifact_id=$1 AND version=$2 ORDER BY seq DESC LIMIT 1', [artifactId, version])).rows[0]
  if (checkpoint) {
    const file = checkpoint.files[path]
    if (!file) return null
    const bytes = (await versionContents(db, artifactId, [file.sha256])).get(file.sha256)
    return bytes ? { bytes, contentType: file.contentType } : null
  }
  if (state) return null
  // An unconverted reader may preview a fixed source snapshot, but never mix a later resource into it.
  const rows = (await db.query<{ path: string; sha256: string; body: Buffer; content_type: string }>('SELECT path,sha256,body,content_type FROM artifact_files WHERE artifact_id=$1 ORDER BY path COLLATE "C"', [artifactId])).rows
  if ('local-' + sha256(rows.map(row => `${row.path}:${row.sha256}`).join('\n')).slice(0, 16) !== version) return null
  const file = rows.find(row => row.path === path)
  return file ? { bytes: file.body, contentType: file.content_type } : null
}

export async function readNativeOriginalBlob(db: Queryable, artifactId: string, blobId: string) {
  const row = (await db.query<{ original_manifest: OriginalManifest | null }>('SELECT original_manifest FROM artifact_document_state WHERE artifact_id=$1', [artifactId])).rows[0]
  const blob = row?.original_manifest?.blobs?.[blobId]
  if (!blob) return null
  const bytes = await storage.readObjectBounded(blob.storageKey, blob.size + 1)
  if (bytes.length !== blob.size || sha256(bytes) !== blob.sha256) throw new NativeDocumentError(409, 'original_asset_changed', 'An original asset failed its recorded content hash check.')
  return { bytes, contentType: blob.contentType, sha256: blob.sha256 }
}

export async function nativeSourceArchive(db: Queryable, artifactId: string) {
  const rows = (await db.query<{ path: string; sha256: string; content_type: string; body: Buffer }>('SELECT path,sha256,content_type,body FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [artifactId])).rows
  const state = (await db.query<{ original_manifest: OriginalManifest | null }>('SELECT original_manifest FROM artifact_document_state WHERE artifact_id=$1', [artifactId])).rows[0]
  const originals: Record<string, { sha256: string; base64: string }> = {}
  if (state?.original_manifest) {
    const contents = await versionContents(db, artifactId, Object.values(state.original_manifest.files).map(file => file.sha256))
    for (const [path, file] of Object.entries(state.original_manifest.files)) {
      const bytes = contents.get(file.sha256)
      if (!bytes) throw new NativeDocumentError(500, 'missing_original', 'An original file is unavailable.')
      originals[path] = { sha256: file.sha256, base64: bytes.toString('base64') }
    }
  }
  const assets: Record<string, { sha256: string; contentType: string; base64: string }> = {}
  const manifests = { ...await nativeBlobManifest(db, artifactId), ...state?.original_manifest?.blobs }
  for (const [id, asset] of Object.entries(manifests)) {
    const bytes = await storage.readObjectBounded(asset.storageKey, asset.size + 1)
    if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) throw new NativeDocumentError(409, 'original_asset_changed', 'An asset failed its recorded content hash check.')
    assets[id] = { sha256: asset.sha256, contentType: asset.contentType, base64: bytes.toString('base64') }
  }
  return { artifactId, files: Object.fromEntries(rows.map(row => [row.path, { sha256: row.sha256, contentType: row.content_type, base64: row.body.toString('base64') }])), originals, assets }
}

/** Read immutable checkpoint bytes without adopting them as the current document. */
export async function readNativeRevision(db: Queryable, input: {artifactId:string;companyId:string;seq:string}):Promise<NativeDocumentSnapshot> {
  const artifact=await scopedArtifact(db,input.artifactId,input.companyId)
  let pageVersions:Record<string,string>={}
  const checkpoint = (await db.query<{ files: Record<string, ListedFile>; version: string }>('SELECT files,version FROM artifact_revisions WHERE artifact_id=$1 AND seq=$2', [input.artifactId, input.seq])).rows[0]
  if (!checkpoint) throw new NativeDocumentError(404, 'revision_not_found', 'Revision not found')
  const contents = await versionContents(db, input.artifactId, Object.values(checkpoint.files).map(file => file.sha256))
  let restored: ArtifactDocument
  if (checkpoint.files[NATIVE_DOCUMENT_PATH]) {
    const bytes = contents.get(checkpoint.files[NATIVE_DOCUMENT_PATH].sha256)
    if (!bytes) throw new NativeDocumentError(500, 'missing_revision', 'Revision content missing')
    const { pageFiles, ...metadata } = JSON.parse(bytes.toString('utf8')) as Manifest
    pageVersions=pageFiles
    const pages: Record<string, ArtifactPage> = {}
    for (const [id, hash] of Object.entries(pageFiles)) {
      const page = contents.get(hash)
      if (!page) throw new NativeDocumentError(500, 'missing_revision', 'Revision page missing')
      pages[id] = JSON.parse(page.toString('utf8'))
    }
    restored = validateArtifactDocument({ ...metadata, pages })
  } else {
    const files: SourceSnapshot['files'] = {}
    for (const [path, file] of Object.entries(checkpoint.files)) {
      const bytes = contents.get(file.sha256)
      if (!bytes) throw new NativeDocumentError(500, 'missing_revision', 'Revision source missing')
      files[path] = { content: legacyConversionText(path, file.contentType, bytes), sha256: file.sha256 }
    }
    restored = (await convertInWorker({ artifact, files })).document
    stampLegacyResources(restored, checkpoint.version)
    stampEmbeddedSources(restored,restored.pageOrder)
  }
  return {document:restored,pageVersions,history:{version:0,undo:null,redo:null}}
}

/** A retained file checkpoint is restored through native operations; original source manifests never change. */
export async function restoreNativeRevision(db: Queryable, input: { artifactId: string; companyId: string; actorId: string; seq: string; version: string }) {
  await scopedArtifact(db, input.artifactId, input.companyId, true)
  if ((await listing(db, input.artifactId)).ver !== input.version) throw new NativeDocumentError(409, 'version_conflict', 'The document changed. Refresh its revision before restoring.')
  const current = await readNativeDocument(db, input.artifactId)
  if (!current) throw new NativeDocumentError(409, 'native_document_required', 'Open this document before restoring history.')
  const {document:restored}=await readNativeRevision(db,input)
  const operations: ArtifactOperation[] = []
  // Delete pages before replacing their resources; validation runs on the complete transaction.
  for (const pageId of current.document.pageOrder) operations.push({ type: 'page.delete', pageId } as ArtifactOperation)
  for (const id of Object.keys(current.document.assets)) operations.push({ type: 'asset.delete', assetId: id } as ArtifactOperation)
  for (const id of Object.keys(current.document.themes)) operations.push({ type: 'theme.delete', themeId: id } as ArtifactOperation)
  for (const asset of Object.values(restored.assets)) operations.push({ type: 'asset.set', asset } as ArtifactOperation)
  for (const theme of Object.values(restored.themes)) operations.push({ type: 'theme.set', theme } as ArtifactOperation)
  operations.push({ type: 'document.patch', patch: { title: restored.title, themeId: restored.themeId } } as ArtifactOperation)
  for (const pageId of restored.pageOrder) operations.push({ type: 'page.insert', page: restored.pages[pageId] } as ArtifactOperation)
  return submitNativeOperations(db, { ...input, actorKind: 'user', kind: 'restore', request: prepareBatch(current.document, operations, `restore-${randomUUID()}`) })
}
