import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Queryable } from '../../db/queryable.js'
import { storage } from '../../storage.js'
import { ARTIFACT_KIND_DEFINITIONS, BAOYU_DESIGN_ROOT, type ArtifactKind } from './kinds.js'
import { assetExtensionOf, blobIds, isProjectPath } from './store.js'

const CHECK_TIMEOUT_MS = 60_000
const MAX_CHECK_BLOB_BYTES = 128 * 1024 * 1024

/**
 * The upstream checker (`scripts/artifact.mjs check <root>`) runs unchanged: the artifact is
 * written as the folder it expects, `<root>/project/…` with uploads under `project/assets/`.
 */
export function checkedDesignBoardPaths(files:readonly {path:string;body:Buffer}[],requested:readonly string[]):string[] {
  try {
    const index = JSON.parse(files.find(file=>file.path === 'project/canvas.json')?.body.toString('utf8') ?? '{}')
    const indexed = new Set(Object.keys(index.boards ?? {}).map(path=>`project/${path}`))
    return requested.slice(0,32).filter(path=>isProjectPath(path) && /^project\/.+\.dc\.html$/.test(path) && indexed.has(path)
      && files.some(file=>file.path === path && file.body.toString('utf8').trim().length > 0))
  } catch { return [] }
}

export async function checkArtifact(db: Queryable, artifact: { id: string; kind: ArtifactKind }, signal?: AbortSignal, requestedPaths?:readonly string[]): Promise<unknown> {
  const definition = ARTIFACT_KIND_DEFINITIONS[artifact.kind]
  const script = resolve(BAOYU_DESIGN_ROOT, definition.skillDirectory, 'scripts', 'artifact.mjs')
  const root = await mkdtemp(join(tmpdir(), 'lingxiloop-artifact-'))
  try {
    const { rows } = await db.query<{ path: string; body: Buffer }>('SELECT path,body FROM artifact_files WHERE artifact_id=$1', [artifact.id])
    for (const row of rows) {
      if (!isProjectPath(row.path)) continue
      const file = join(root, ...row.path.split('/'))
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, row.body)
    }
    const assets = join(root, 'project', definition.layout.blobDir)
    await mkdir(assets, { recursive: true })
    const index: Record<string, string> = {}
    let budget = MAX_CHECK_BLOB_BYTES
    for (const blob of await blobIds(db, artifact.id)) {
      signal?.throwIfAborted()
      index[blob.id] = blob.content_type
      const bytes = budget > 0 ? await storage.readObjectBounded(blob.storage_key, Math.min(budget, definition.layout.maxBlobBytes), signal) : Buffer.alloc(0)
      budget -= bytes.length
      await writeFile(join(assets, `${blob.id}.${assetExtensionOf(blob.content_type)}`), bytes)
    }
    await writeFile(join(assets, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
    const stdout = await new Promise<string>((resolveRun, rejectRun) => {
      execFile(process.execPath, [script, 'check', root], {
        cwd: tmpdir(), env: { PATH: process.env.PATH ?? '', BAOCUT_SLIDES_EDITOR_DIST: resolve('server/assets/slides-editor') }, timeout: CHECK_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024,
        ...(signal ? { signal } : {}),
      }, (error, out) => {
        // The checker exits 1 while problems remain; its JSON report is the result either way.
        if (error && !out.trim()) rejectRun(new Error('artifact check failed to run'))
        else resolveRun(out)
      })
    })
    const report = JSON.parse(stdout)
    // Membership is from the exact same snapshot the checker inspected. Limit
    // the proof to requested authored paths so large old canvases stay bounded.
    return artifact.kind === 'design' && requestedPaths ? {...report,checkedBoardPaths:checkedDesignBoardPaths(rows,requestedPaths)} : report
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
