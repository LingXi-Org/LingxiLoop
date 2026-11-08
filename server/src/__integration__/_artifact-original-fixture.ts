import type { Queryable } from '../db/queryable.js'
import { listing, sha256 } from '../modules/artifacts/store.js'

/** Seed immutable pre-native source revisions; product code never writes this format. */
export async function seedOriginalRevision(db: Queryable, artifactId: string,
  files: Record<string, { body: Buffer; contentType: string }>, actorId: string) {
  for (const [path, file] of Object.entries(files)) {
    await db.query(`INSERT INTO artifact_files(artifact_id,path,sha256,size,content_type,body,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(artifact_id,path) DO UPDATE SET
      sha256=EXCLUDED.sha256,size=EXCLUDED.size,content_type=EXCLUDED.content_type,body=EXCLUDED.body,updated_by=EXCLUDED.updated_by`,
      [artifactId, path, sha256(file.body), file.body.length, file.contentType, file.body, actorId])
  }
  const seq = Number((await db.query<{ seq: string }>('UPDATE artifacts SET seq=seq+1 WHERE id=$1 RETURNING seq', [artifactId])).rows[0]!.seq)
  const current = await listing(db, artifactId)
  await db.query(`INSERT INTO artifact_file_versions(artifact_id,sha256,body)
    SELECT artifact_id,sha256,body FROM artifact_files WHERE artifact_id=$1 ON CONFLICT DO NOTHING`, [artifactId])
  await db.query('INSERT INTO artifact_revisions(artifact_id,seq,version,files,actor_id) VALUES($1,$2,$3,$4::jsonb,$5)',
    [artifactId, seq, current.ver, JSON.stringify(current.files), actorId])
  return { seq, version: current.ver }
}
