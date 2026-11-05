import type { Queryable } from '../../db/queryable.js'
import type { ArtifactKind } from './kinds.js'
import { isProjectPath } from './store.js'
import { checkArtifactDocument } from '../../../../shared/artifact-check.js'

export function checkedDesignBoardPaths(files:readonly {path:string;body:Buffer}[],requested:readonly string[]):string[] {
  try {
    const index = JSON.parse(files.find(file=>file.path === 'project/canvas.json')?.body.toString('utf8') ?? '{}')
    const indexed = new Set(Object.keys(index.boards ?? {}).map(path=>`project/${path}`))
    return requested.slice(0,32).filter(path=>isProjectPath(path) && /^project\/.+\.dc\.html$/.test(path) && indexed.has(path)
      && files.some(file=>file.path === path && file.body.toString('utf8').trim().length > 0))
  } catch { return [] }
}

/** Structural checks consume the exact saved native model, never an editor CLI. */
export async function checkArtifact(db: Queryable, artifact: { id: string; kind: ArtifactKind }, signal?: AbortSignal, requestedPaths?: readonly string[]): Promise<unknown> {
  signal?.throwIfAborted()
  const { readNativeDocument, ensureNativeDocument } = await import('./native-document.js')
  let snapshot = await readNativeDocument(db, artifact.id)
  if (!snapshot) {
    const row = (await db.query<{ company_id: string }>('SELECT company_id FROM artifacts WHERE id=$1', [artifact.id])).rows[0]
    if (!row) throw Object.assign(new Error('Artifact not found'), { status: 404 })
    snapshot = await ensureNativeDocument({ db, transaction: run => run(db) }, {
      artifactId: artifact.id, companyId: row.company_id, actorId: 'checker', write: false,
    })
  }
  signal?.throwIfAborted()
  const nativePaths = requestedPaths?.filter(path => /^project\/pages\/[a-zA-Z0-9_-]+\.json$/.test(path))
  const report = checkArtifactDocument(snapshot.document, nativePaths?.length ? nativePaths : undefined)
  const legacyPaths = requestedPaths?.filter(path => path.endsWith('.dc.html'))
  if (legacyPaths?.length && !nativePaths?.length) {
    const rows = (await db.query<{ path: string; body: Buffer }>('SELECT path,body FROM artifact_files WHERE artifact_id=$1', [artifact.id])).rows
    return { ...report, checkedBoardPaths: checkedDesignBoardPaths(rows, legacyPaths) }
  }
  return report
}
