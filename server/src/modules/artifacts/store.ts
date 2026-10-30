import { createHash, createHmac } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { env } from '../../env.js'
import { storage } from '../../storage.js'
import type { ArtifactKindDefinition } from './kinds.js'

// Ported from baoyu-design server.mjs `Store`: the folder on disk becomes rows of
// artifact_files (one transaction per publish) and uploads go to object storage.

export const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html', json: 'application/json', css: 'text/css', js: 'text/javascript',
  mjs: 'text/javascript', md: 'text/markdown', txt: 'text/plain', xml: 'application/xml', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg',
  wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', wasm: 'application/wasm',
}
const EXT_BY_MIME: Record<string, string> = {
  'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/avif': 'avif', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/x-icon': 'ico', 'audio/mpeg': 'mp3',
  'audio/wav': 'wav', 'application/pdf': 'pdf', 'text/css': 'css', 'text/javascript': 'js', 'application/json': 'json',
}
export const BLOB_ID = /^[0-9a-f]{32}$/

export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
export function contentTypeOf(file: string) {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  return MIME[ext] ?? 'application/octet-stream'
}
export const assetExtensionOf = (contentType: string) =>
  EXT_BY_MIME[(contentType.split(';')[0] ?? '').trim().toLowerCase()] ?? 'bin'

export function isProjectPath(p: unknown): p is string {
  if (typeof p !== 'string' || !p.startsWith('project/') || p.includes('\\') || p.includes('\0')) return false
  return p.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

export type WireEntry = { base64: string; contentType: string; ifMatch?: string | null } | { delete: true; ifMatch?: string } | null
const isWriteEntry = (entry: WireEntry): entry is { base64: string; contentType: string; ifMatch?: string | null } =>
  entry !== null && !('delete' in entry)
export function isWireEntry(value: unknown): value is WireEntry {
  if (value === null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  if (entry.delete === true) return entry.ifMatch === undefined || typeof entry.ifMatch === 'string'
  if (entry.ifMatch !== undefined && entry.ifMatch !== null && typeof entry.ifMatch !== 'string') return false
  return typeof entry.base64 === 'string' && typeof entry.contentType === 'string'
}

export interface ListedFile { sha256: string; size: number; contentType: string }
export interface Listing { ver: string; files: Record<string, ListedFile> }

function versionOf(files: Record<string, ListedFile>) {
  const digest = sha256(Object.entries(files).map(([p, f]) => `${p}:${f.sha256}`).join('\n'))
  return 'local-' + digest.slice(0, 16)
}

/** project/<path> → its path relative to project/, or null when the editor may not see or write it. */
export function fileOf(definition: ArtifactKindDefinition, runtimePath: string) {
  if (!isProjectPath(runtimePath)) return null
  const rel = runtimePath.slice('project/'.length)
  return definition.layout.isFile(rel) ? rel : null
}

export async function listing(db: Queryable, artifactId: string): Promise<Listing> {
  const { rows } = await db.query<{ path: string; sha256: string; size: number; content_type: string }>(
    'SELECT path,sha256,size,content_type FROM artifact_files WHERE artifact_id=$1 ORDER BY path COLLATE "C"', [artifactId])
  const files: Record<string, ListedFile> = {}
  for (const row of rows) files[row.path] = { sha256: row.sha256, size: Number(row.size), contentType: row.content_type }
  return { ver: versionOf(files), files }
}

export async function readProjectFile(db: Queryable, definition: ArtifactKindDefinition, artifactId: string, p: string) {
  if (fileOf(definition, p) === null) return null
  const { rows } = await db.query<{ body: Buffer }>('SELECT body FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifactId, p])
  return rows[0]?.body ?? null
}

export interface PublishOutcome {
  status: number
  body: { code?: string; message?: string; live?: string; paths?: unknown[]; version?: string; seq?: number; shas?: Record<string, string> }
  changed: string[]
}

/** A save: all entries or none (ifMatch is checked for all before anything is written). Runs inside the caller's transaction. */
export async function publish(db: Queryable, definition: ArtifactKindDefinition, artifactId: string,
  batch: Record<string, WireEntry>, actorId: string): Promise<PublishOutcome> {
  const { layout } = definition
  let total = 0
  for (const [p, entry] of Object.entries(batch)) {
    if (fileOf(definition, p) === null) return { status: 400, body: { code: 'read_only_path', message: layout.readOnlyMessage(p) }, changed: [] }
    if (!isWriteEntry(entry)) continue
    const bytes = Buffer.byteLength(entry.base64, 'base64')
    if (bytes > layout.maxFileBytes) {
      return { status: 413, body: { code: 'too_large', message: `${p}: a file can be at most ${layout.maxFileBytes} bytes` }, changed: [] }
    }
    total += bytes
  }
  if (total > layout.maxPublishBytes) {
    return { status: 413, body: { code: 'too_large', message: `a publish can write at most ${layout.maxPublishBytes} bytes` }, changed: [] }
  }
  const locked = await db.query<{ seq: string }>('SELECT seq FROM artifacts WHERE id=$1 FOR UPDATE', [artifactId])
  if (!locked.rows[0]) return { status: 404, body: { code: 'not_found', message: 'artifact not found' }, changed: [] }
  const before = await listing(db, artifactId)
  const conflicts: { path: string; actual: string | null; expected: string | null }[] = []
  for (const [p, entry] of Object.entries(batch)) {
    const expected = entry?.ifMatch
    if (expected === undefined) continue
    const actual = before.files[p]?.sha256 ?? null
    if (actual !== expected) conflicts.push({ path: p, actual, expected })
  }
  if (conflicts.length > 0) return { status: 409, body: { code: 'conflict', live: before.ver, paths: conflicts }, changed: [] }
  const created = Object.entries(batch).filter(([p, entry]) => isWriteEntry(entry) && !before.files[p]).length
  const deleted = Object.entries(batch).filter(([p, entry]) => !isWriteEntry(entry) && before.files[p]).length
  if (Object.keys(before.files).length + created - deleted > layout.maxFiles) {
    return { status: 413, body: { code: 'too_large', message: `the ${definition.noun} holds at most ${layout.maxFiles} files` }, changed: [] }
  }
  const shas: Record<string, string> = {}
  const changed: string[] = []
  for (const [p, entry] of Object.entries(batch)) {
    if (!isWriteEntry(entry)) {
      const removed = await db.query('DELETE FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifactId, p])
      if (removed.rowCount) changed.push(p)
      continue
    }
    const bytes = Buffer.from(entry.base64, 'base64')
    const sha = sha256(bytes)
    shas[p] = sha
    if (before.files[p]?.sha256 === sha) continue
    await db.query(`INSERT INTO artifact_files(artifact_id,path,sha256,size,content_type,body,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(artifact_id,path) DO UPDATE SET sha256=EXCLUDED.sha256,size=EXCLUDED.size,
        content_type=EXCLUDED.content_type,body=EXCLUDED.body,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
    [artifactId, p, sha, bytes.length, contentTypeOf(p), bytes, actorId])
    changed.push(p)
  }
  const { rows } = await db.query<{ seq: string }>('UPDATE artifacts SET seq=seq+1,updated_at=NOW() WHERE id=$1 RETURNING seq', [artifactId])
  const after = await listing(db, artifactId)
  return { status: 200, body: { version: after.ver, seq: Number(rows[0].seq), shas }, changed }
}

/** The host secret binds content ids to one artifact, so a root /_blob/<id> URL is an unguessable capability. */
function blobKey() {
  return createHmac('sha256', env.GATEWAY_HMAC_SECRET).update('lingxiloop:artifact-blob:v1').digest()
}
export const blobIdOf = (artifactId: string, sha: string) =>
  createHmac('sha256', blobKey()).update(`${artifactId}:${sha}`).digest('hex').slice(0, 32)

/** An upload, addressed by content: the same bytes always get the same url, stored once. */
export async function putBlob(db: Queryable, definition: ArtifactKindDefinition, artifactId: string, bytes: Buffer, contentType: string) {
  if (bytes.length === 0) throw Object.assign(new Error('empty upload'), { status: 400, code: 'invalid_content' })
  if (bytes.length > definition.layout.maxBlobBytes) throw Object.assign(new Error('upload is too large'), { status: 413, code: 'too_large' })
  const type = (contentType.split(';')[0] ?? '').trim().toLowerCase() || 'application/octet-stream'
  const sha = sha256(bytes), id = blobIdOf(artifactId, sha)
  const existing = await db.query('SELECT 1 FROM artifact_blobs WHERE artifact_id=$1 AND id=$2', [artifactId, id])
  if (!existing.rows[0]) {
    const key = `artifacts/${artifactId}/${definition.layout.blobDir}/${id}.${assetExtensionOf(type)}`
    await storage.put(key, bytes, type)
    await db.query(`INSERT INTO artifact_blobs(artifact_id,id,sha256,size,content_type,storage_key) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(artifact_id,id) DO NOTHING`, [artifactId, id, sha, bytes.length, type, key])
  }
  return { id, url: `/_blob/${id}`, sizeBytes: bytes.byteLength }
}

export async function blobFile(db: Queryable, id: string, artifactId?: string) {
  if (!BLOB_ID.test(id)) return null
  const { rows } = await db.query<{ artifact_id: string; storage_key: string; content_type: string; size: string }>(
    `SELECT artifact_id,storage_key,content_type,size FROM artifact_blobs WHERE id=$1 AND ($2::text IS NULL OR artifact_id=$2)`,
    [id, artifactId ?? null])
  return rows[0] ? { artifactId: rows[0].artifact_id, storageKey: rows[0].storage_key, contentType: rows[0].content_type, size: Number(rows[0].size) } : null
}

export async function blobIds(db: Queryable, artifactId: string) {
  const { rows } = await db.query<{ id: string; storage_key: string; content_type: string }>(
    'SELECT id,storage_key,content_type FROM artifact_blobs WHERE artifact_id=$1', [artifactId])
  return rows
}
