import { createHash, createHmac } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { env } from '../../env.js'
import { storage } from '../../storage.js'
import type { ArtifactKindDefinition } from './kinds.js'

// Immutable source files and content-addressed assets for native documents.

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

export interface ListedFile { sha256: string; size: number; contentType: string }
export interface Listing { ver: string; files: Record<string, ListedFile> }

function versionOf(files: Record<string, ListedFile>) {
  const digest = sha256(Object.entries(files).map(([p, f]) => `${p}:${f.sha256}`).join('\n'))
  return 'local-' + digest.slice(0, 16)
}

/** project/<path> → its path relative to project/, or null outside the allowed source/resource read scope. */
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
  const nativePath = p === 'project/document.json' || /^project\/pages\/[A-Za-z0-9_-]{1,128}\.json$/.test(p)
  if (!nativePath && fileOf(definition, p) === null) return null
  const { rows } = await db.query<{ body: Buffer }>('SELECT body FROM artifact_files WHERE artifact_id=$1 AND path=$2', [artifactId, p])
  return rows[0]?.body ?? null
}

/** The host secret binds content ids to one artifact, so a root /_blob/<id> URL is an unguessable capability. */
function blobKey() {
  return createHmac('sha256', env.GATEWAY_HMAC_SECRET).update('lingxiloop:artifact-blob:v1').digest()
}
export const blobIdOf = (artifactId: string, sha: string) =>
  createHmac('sha256', blobKey()).update(`${artifactId}:${sha}`).digest('hex').slice(0, 32)

/** An upload, addressed by content: the same bytes always get the same url, stored once. */
export async function putBlob(db: Queryable, definition: ArtifactKindDefinition, artifactId: string, bytes: Buffer, contentType: string, options: { video?: boolean } = {}) {
  if (bytes.length === 0) throw Object.assign(new Error('empty upload'), { status: 400, code: 'invalid_content' })
  if (bytes.length > definition.layout.maxBlobBytes) throw Object.assign(new Error('upload is too large'), { status: 413, code: 'too_large' })
  const type = (contentType.split(';')[0] ?? '').trim().toLowerCase() || 'application/octet-stream'
  if (definition.kind === 'slides' && type.startsWith('video/') && !options.video) {
    throw Object.assign(new Error('video uploads are not supported'), { status: 415, code: 'invalid_content' })
  }
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
