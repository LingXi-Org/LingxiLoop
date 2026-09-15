import { randomUUID } from 'node:crypto'
import { Avatar, Style } from '@dicebear/core'
import marbles from '@dicebear/styles/marbles.json' with { type: 'json' }
import planets from '@dicebear/styles/planets.json' with { type: 'json' }
import type { AvatarInput } from './contracts.js'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { storage, type Storage, type BoundedStorageReader } from '../../storage.js'
import { MAX_UPLOAD_BYTES } from '../platform/contracts.js'

const styles = { user: new Style(marbles), course: new Style(planets) }
const MAX_AVATAR_BYTES = Math.min(MAX_UPLOAD_BYTES, 5 * 1024 * 1024)

export async function prepareAvatar(
  db: Queryable,
  scope: { companyId: string; userId: string },
  input: AvatarInput,
  kind: 'user' | 'course',
  objects: Storage & BoundedStorageReader = storage,
): Promise<{ avatarSeed: string | null; avatarUrl: string }> {
  if ('seed' in input) {
    const avatar = new Avatar(styles[kind], { seed: input.seed,
      ...(kind === 'course' ? { planetColor: ['e27a8c', 'e37f64', 'd88a40', 'c1982a', 'd67cb2'] } : {}),
    })
    return { avatarSeed: input.seed, avatarUrl: avatar.toDataUri() }
  }
  const { rows } = await db.query(`SELECT 1 FROM uploaded_files f
    JOIN company_memberships m ON m.period_id=f.company_period_id AND m.user_id=f.owner_user_id
      AND m.company_id=f.company_id AND m.status='ACTIVE' AND m.ended_at IS NULL
    WHERE f.storage_key=$1 AND f.company_id=$2 AND f.owner_user_id=$3 AND f.document_id IS NULL`,
  [input.key, scope.companyId, scope.userId])
  if (!rows.length || !input.key.startsWith(`attachments/${scope.companyId}/`)) throw new HttpError(403, '头像必须使用本人上传的图片')
  const meta = await objects.statObject(input.key)
  if (meta.sizeBytes <= 0 || meta.sizeBytes > MAX_AVATAR_BYTES) throw new HttpError(413, '头像图片不能超过 5 MB')
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
  const ext = extensions[meta.contentType ?? '']
  if (!ext) throw new HttpError(415, '头像仅支持 PNG、JPEG、WebP')
  const bytes = await objects.readObjectBounded(input.key, MAX_AVATAR_BYTES)
  const matches = ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!matches || bytes.length !== meta.sizeBytes) throw new HttpError(415, '头像图片内容与类型不匹配')
  // Copy to an immutable avatar key: the original upload URL can still be used until it expires.
  const avatarUrl = await objects.put(`avatars/${scope.companyId}/${randomUUID()}.${ext}`, bytes, meta.contentType!)
  return { avatarSeed: null, avatarUrl }
}

export async function saveUserAvatar(db: Queryable, scope: { companyId: string; userId: string }, avatar: { avatarSeed: string | null; avatarUrl: string }) {
  const updated = await db.query(`UPDATE users u SET avatar_seed=$3,avatar_url=$4
    FROM company_memberships m WHERE u.id=$1 AND m.user_id=u.id AND m.company_id=$2
      AND m.status='ACTIVE' AND m.ended_at IS NULL AND u.deleted_at IS NULL
      AND u.suspended_at IS NULL AND u.departed_at IS NULL`,
  [scope.userId, scope.companyId, avatar.avatarSeed, avatar.avatarUrl])
  if (updated.rowCount !== 1) throw new HttpError(403, 'active company membership required')
  await db.query(`UPDATE participants SET avatar_url=$3,updated_at=NOW()
    WHERE id=$1 AND company_id=$2 AND kind='human'`, [scope.userId, scope.companyId, avatar.avatarUrl])
  return avatar
}
