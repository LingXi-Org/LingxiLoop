/**
 * One-shot migration: move locally-stored uploads (server/uploads/*) into R2
 * and rewrite DB rows that still point at `/uploads/...`.
 *
 * Scope:
 *   - participants.avatar_url   → `/uploads/avatar-…png` becomes
 *                                 `https://cdn.example.com/avatars/…png`
 *   - messages.attachment       → adds `key` to the JSONB and rewrites
 *                                 `url` to the storage layer's fresh URL
 *                                 (HMAC-signed for `attachments/` prefix).
 *
 * Idempotent — rows already pointing at the public base are left alone.
 * Orphan files on disk (avatars from past generations that nothing in the DB
 * references) are NOT uploaded — saves bytes in the bucket. Run with:
 *
 *   tsx server/src/scripts/migrate-uploads-to-r2.ts
 *
 * Requires R2_* env to be configured (otherwise the storage layer is in
 * local mode and there's nothing to migrate).
 */
import 'dotenv/config'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { storage, UPLOAD_DIR } from '../storage.js'
import { pool } from '../db/pool.js'

if (storage.mode !== 'r2') {
  console.error('[migrate] storage is in local mode — set R2_* env vars first')
  process.exit(1)
}

/** Decide the storage key for a legacy upload filename. Files named
 *  `avatar-…` belong under `avatars/`; everything else (the raw-uuid PNGs
 *  the old upload endpoint produced) becomes a regular attachment. */
function keyForLegacyFile(filename: string): string {
  if (filename.startsWith('avatar-')) return `avatars/${filename}`
  return `attachments/${filename}`
}

function mimeForFile(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'pdf': return 'application/pdf'
    case 'txt': return 'text/plain'
    case 'md':  return 'text/markdown'
    case 'csv': return 'text/csv'
    case 'json': return 'application/json'
    default: return 'application/octet-stream'
  }
}

/** Pull the legacy filename out of a `/uploads/<filename>` URL.
 *  Returns null for anything that doesn't look like a local URL. */
function legacyFilenameFromUrl(url: string): string | null {
  const m = url.match(/^\/uploads\/([^/?#]+)$/)
  return m ? m[1] : null
}

async function uploadLegacyFile(filename: string): Promise<{ key: string; url: string } | null> {
  const path = join(UPLOAD_DIR, filename)
  try {
    await stat(path)
  } catch {
    console.warn(`[migrate]   missing on disk: ${filename}`)
    return null
  }
  const bytes = await readFile(path)
  const key = keyForLegacyFile(filename)
  const mime = mimeForFile(filename)
  const url = await storage.put(key, bytes, mime)
  return { key, url }
}

async function migrateAvatars(): Promise<void> {
  const { rows } = await pool.query<{ id: string; company_id: string; avatar_url: string }>(
    `SELECT id, company_id, avatar_url
       FROM participants
      WHERE avatar_url LIKE '/uploads/%'`,
  )
  console.log(`[migrate] avatars: ${rows.length} row(s) to migrate`)
  for (const r of rows) {
    const filename = legacyFilenameFromUrl(r.avatar_url)
    if (!filename) { console.warn(`[migrate]   skipping ${r.id}: unparsable url ${r.avatar_url}`); continue }
    const up = await uploadLegacyFile(filename)
    if (!up) continue
    await pool.query(
      `UPDATE participants SET avatar_url = $2 WHERE id = $1 AND company_id = $3`,
      [r.id, up.url, r.company_id],
    )
    console.log(`[migrate]   ✓ ${r.id} → ${up.url}`)
  }
}

async function migrateMessageAttachments(): Promise<void> {
  const { rows } = await pool.query<{ id: string; attachment: Record<string, unknown> }>(
    `SELECT id, attachment
       FROM messages
      WHERE attachment->>'url' LIKE '/uploads/%'`,
  )
  console.log(`[migrate] message attachments: ${rows.length} row(s) to migrate`)
  for (const r of rows) {
    const oldUrl = String(r.attachment?.url ?? '')
    const filename = legacyFilenameFromUrl(oldUrl)
    if (!filename) { console.warn(`[migrate]   skipping ${r.id}: unparsable url ${oldUrl}`); continue }
    const up = await uploadLegacyFile(filename)
    if (!up) continue
    // Stamp both `url` and `key` onto the JSONB — `key` is what
    // `freshenAttachmentUrl` uses to re-sign on every read, so this
    // ensures historical bubbles stay live past the initial TTL.
    const next = { ...r.attachment, url: up.url, key: up.key }
    await pool.query(
      `UPDATE messages SET attachment = $2::jsonb WHERE id = $1`,
      [r.id, JSON.stringify(next)],
    )
    console.log(`[migrate]   ✓ msg ${r.id} → ${up.key}`)
  }
}

async function main(): Promise<void> {
  console.log(`[migrate] storage mode: ${storage.mode}`)
  await migrateAvatars()
  await migrateMessageAttachments()
  console.log('[migrate] done.')
  await pool.end()
}

main().catch((err) => {
  console.error('[migrate] fatal', err)
  process.exitCode = 1
  void pool.end()
})
