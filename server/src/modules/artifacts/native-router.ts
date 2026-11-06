import {artifactPageIds} from '../../../../shared/artifact-canvas-pages.js'
import { raw, Router, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { requireArtifact } from '../../http/authorization.js'
import { safe } from '../../http/async-handler.js'
import { permissionService } from '../access/public.js'
import { storage } from '../../storage.js'
import { publishArtifactEvent, onArtifactEvent } from './events.js'
import { artifactKind } from './kinds.js'
import { blobFile, putBlob, sha256 } from './store.js'
import { NativeHistoryConflict } from './native-history.js'
import {
  ensureNativeDocument, nativeDocumentChanges, NativeDocumentError, nativeWritesEnabled,
  nativeSourceArchive, readNativeOriginal, readNativeOriginalBlob, readNativePage, readNativePageSnapshot, readNativeRevision, submitNativeOperations,
  type NativeOperationResult,
} from './native-document.js'
import { projectNativeSnapshot } from './native-projection.js'
import { artifactEditorOrigin } from '../../../../shared/artifact-editor-origin.js'
import { issueGrant } from './grants.js'
import { env } from '../../env.js'
import { nativeCommentsRouter } from './native-comments-router.js'

export const nativeArtifactsRouter = Router()
nativeArtifactsRouter.use(nativeCommentsRouter)
const transaction = <T>(work: Parameters<typeof withTransaction<T>>[1]) => withTransaction(pool, work)
const assetCsp = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"

function respondError(response: Response, error: unknown): boolean {
  if (error instanceof NativeDocumentError) {
    response.status(error.status).json({ code: error.code, error: error.message, ...(error.details ? { details: error.details } : {}) })
    return true
  }
  if (error instanceof NativeHistoryConflict) {
    response.status(409).json({ code: error.code, error: error.message, history: error.history })
    return true
  }
  return false
}

nativeArtifactsRouter.get('/artifacts/:id/document', safe(async (req, res) => {
  const artifactId = String(req.params.id)
  const scope = await requireArtifact(req, artifactId)
  const write = nativeWritesEnabled() && (await permissionService.can({ companyId: scope.companyId, actorUserId: scope.userId, action: 'artifact:write', resource: { type: 'artifact', id: artifactId } })).allowed
  try {
    const snapshot = await ensureNativeDocument({ db: pool, transaction }, { artifactId, companyId: scope.companyId, actorId: scope.userId, write })
    const requested = typeof req.query.pages === 'string' ? req.query.pages.split(',').filter(Boolean) : [snapshot.document.pageOrder[0]].filter((id): id is string => Boolean(id))
    const loaded = req.query.allPages === 'true' ? artifactPageIds(snapshot.document) : requested
    res.set('Cache-Control', 'no-store').json({ ...projectNativeSnapshot(snapshot, loaded), write })
  } catch (error) { if (!respondError(res, error)) throw error }
}))

nativeArtifactsRouter.get('/artifacts/:id/revisions/:seq/document',safe(async(req,res)=>{
  const artifactId=String(req.params.id),scope=await requireArtifact(req,artifactId)
  const seq=z.string().regex(/^\d{1,18}$/).parse(req.params.seq)
  try{
    const snapshot=await readNativeRevision(pool,{artifactId,companyId:scope.companyId,seq})
    const loaded=req.query.allPages==='true'||!Object.keys(snapshot.pageVersions).length?artifactPageIds(snapshot.document):snapshot.document.pageOrder.slice(0,1)
    res.set('Cache-Control','no-store').json({...projectNativeSnapshot(snapshot,loaded),write:false})
  }catch(error){if(!respondError(res,error))throw error}
}))

nativeArtifactsRouter.get('/artifacts/:id/pages/:pageId', safe(async (req, res) => {
  const artifactId = String(req.params.id)
  const scope = await requireArtifact(req, artifactId)
  const hash = req.query.hash === undefined ? undefined : z.string().regex(/^[a-f0-9]{64}$/).parse(req.query.hash)
  const snapshot = await readNativePageSnapshot(pool, artifactId, String(req.params.pageId), hash)
  let page = snapshot?.page ?? null
  if (!page && !hash) page = (await ensureNativeDocument({ db: pool, transaction }, { artifactId, companyId: scope.companyId, actorId: scope.userId, write: false })).document.pages[String(req.params.pageId)] ?? null
  if (!page) { res.sendStatus(404); return }
  res.set('Cache-Control', hash ? 'private, max-age=31536000, immutable' : 'no-store').json({ page, version: snapshot?.version ?? sha256(Buffer.from(JSON.stringify(page) + '\n')) })
}))

nativeArtifactsRouter.post('/artifacts/:id/operations', safe(async (req, res) => {
  const artifactId = String(req.params.id), scope = await requireArtifact(req, artifactId, true)
  try {
    const result = await withTransaction(pool, db => submitNativeOperations(db, { artifactId, companyId: scope.companyId, actorId: scope.userId, actorKind: 'user', request: req.body }))
    if (!result.deduplicated) await notifyNativeChange(artifactId, scope.companyId, result)
    res.json({ ...projectNativeSnapshot(result, result.changedPageIds), write: nativeWritesEnabled() })
  } catch (error) { if (!respondError(res, error)) throw error }
}))

export function notifyNativeChange(artifactId: string, companyId: string, result: Pick<NativeOperationResult, 'changedPageIds'>) {
  return publishArtifactEvent({ companyId, artifactId, kind: 'files.changed', paths: ['project/document.json', ...result.changedPageIds.map(id => `project/pages/${id}.json`)] })
}

nativeArtifactsRouter.get('/artifacts/:id/changes', safe(async (req, res) => {
  const artifactId = String(req.params.id)
  await requireArtifact(req, artifactId)
  const afterSeq = z.coerce.number().int().nonnegative().safe().default(0).parse(req.query.afterSeq)
  res.set('Cache-Control', 'no-store').json(await nativeDocumentChanges(pool, artifactId, afterSeq))
}))

nativeArtifactsRouter.get('/artifacts/:id/changes/events', safe(async (req, res) => {
  const artifactId = String(req.params.id), scope = await requireArtifact(req, artifactId)
  let cursor = z.coerce.number().int().nonnegative().safe().default(0).parse(req.headers['last-event-id'] ?? req.query.afterSeq)
  let closed = false, running = false, pending = false
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  const push = async () => {
    if (running || closed) { pending = true; return }
    running = true
    try {
      do {
        pending = false
        if (!(await permissionService.can({ companyId: scope.companyId, actorUserId: scope.userId, action: 'artifact:read', resource: { type: 'artifact', id: artifactId } })).allowed) { res.end(); return }
        const batch = await nativeDocumentChanges(pool, artifactId, cursor)
        for (const item of batch.items) {
          if (closed) return
          res.write(`id: ${item.seq}\nevent: operation\ndata: ${JSON.stringify(item)}\n\n`)
          cursor = item.seq
        }
        pending ||= batch.hasMore
      } while (pending && !closed)
    } catch { res.end() }
    finally { running = false }
  }
  // Subscribe before querying durable history, so connecting cannot lose a concurrent commit.
  const stop = onArtifactEvent(artifactId, event => { if (event.kind === 'artifact.deleted') res.end(); else void push() })
  const keepAlive = setInterval(() => { if (!closed) { res.write(': keepalive\n\n'); void push() } }, 15_000)
  keepAlive.unref()
  const close = () => { closed = true; clearInterval(keepAlive); stop() }
  req.on('close', close); res.on('close', close)
  void push()
}))

nativeArtifactsRouter.post('/artifacts/:id/assets', raw({ type: () => true, limit: '20mb' }), safe(async (req, res) => {
  const artifactId = String(req.params.id), scope = await requireArtifact(req, artifactId, true)
  if (!nativeWritesEnabled()) throw new NativeDocumentError(503, 'editor_upgrade_pending', 'Editor upgrade is in progress.')
  const bytes = Buffer.isBuffer(req.body) ? req.body : null
  if (!bytes?.length) { res.status(400).json({ error: 'Expected a media file.' }); return }
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/ogg'].includes(contentType)) { res.status(415).json({ error: 'Unsupported media type.' }); return }
  const asset = await putBlob(pool, artifactKind(scope.kind), artifactId, bytes, contentType, { video: true })
  res.status(201).json({ id: asset.id, url: `/api/artifacts/${encodeURIComponent(artifactId)}/assets/${asset.id}`, contentType, sha256: sha256(bytes) })
}))

nativeArtifactsRouter.get('/artifacts/:id/assets/:assetId', safe(async (req, res) => {
  const artifactId = String(req.params.id)
  await requireArtifact(req, artifactId)
  const asset = await blobFile(pool, String(req.params.assetId), artifactId)
  if (!asset) { res.sendStatus(404); return }
  const bytes = await storage.readObjectBounded(asset.storageKey, asset.size + 1)
  res.set({ 'Content-Type': asset.contentType, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': assetCsp }).end(bytes)
}))

nativeArtifactsRouter.post('/artifacts/:id/embeds/:pageId/:nodeId/grant', safe(async (req, res) => {
  const artifactId = String(req.params.id), scope = await requireArtifact(req, artifactId)
  const input = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), pageHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), revisionSeq:z.string().regex(/^\d{1,18}$/).optional(), nonce: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional() }).strict().parse(req.body)
  const page = input.revisionSeq!==undefined ? (await readNativeRevision(pool,{artifactId,companyId:scope.companyId,seq:input.revisionSeq})).document.pages[String(req.params.pageId)] : input.pageHash ? await readNativePage(pool, artifactId, String(req.params.pageId), input.pageHash)
    : (await ensureNativeDocument({ db: pool, transaction }, { artifactId, companyId: scope.companyId, actorId: scope.userId, write: false })).document.pages[String(req.params.pageId)]
  const embed = page?.nodes[String(req.params.nodeId)]?.embed
  if (!embed) { res.sendStatus(404); return }
  if (sha256(embed.source) !== input.sha256) { res.status(409).json({ code: 'embed_changed', error: 'The embedded content changed. Refresh the page.' }); return }
  const { grant, expiresAt } = issueGrant({ artifactId, companyId: scope.companyId, userId: scope.userId, kind: scope.kind, write: false })
  const prefix = `/artifact-editor/${scope.kind}/${grant}/native/embeds/${encodeURIComponent(String(req.params.pageId))}/${encodeURIComponent(String(req.params.nodeId))}`
  const origin = env.NODE_ENV === 'production' ? await artifactEditorOrigin(grant, env.ARTIFACT_EDITOR_BASE) : ''
  const query = new URLSearchParams({ sha256: input.sha256, nonce: input.nonce ?? randomUUID() })
  if (input.pageHash) query.set('pageHash', input.pageHash)
  if (input.revisionSeq!==undefined) query.set('revisionSeq',input.revisionSeq)
  res.set('Cache-Control', 'no-store').json({ url: `${origin}${prefix}?${query}`, expiresAt })
}))

nativeArtifactsRouter.get(/^\/artifacts\/([^/]+)\/originals\/([a-f0-9]{64})\/(.+)$/, safe(async (req, res) => {
  const artifactId = String(req.params[0])
  await requireArtifact(req, artifactId)
  const original = await readNativeOriginal(pool, artifactId, String(req.params[1]), String(req.params[2]))
  if (!original) { res.sendStatus(404); return }
  res.set({ 'Content-Type': original.contentType, 'Content-Security-Policy': assetCsp, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).end(original.bytes)
}))

nativeArtifactsRouter.get('/artifacts/:id/source', safe(async (req, res) => {
  const artifactId = String(req.params.id)
  await requireArtifact(req, artifactId)
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${artifactId}.lingxi.json"`, 'Cache-Control': 'no-store' }).json(await nativeSourceArchive(pool, artifactId))
}))

nativeArtifactsRouter.get('/artifacts/:id/original-assets/:assetId', safe(async (req, res) => {
  const artifactId = String(req.params.id)
  await requireArtifact(req, artifactId)
  const asset = await readNativeOriginalBlob(pool, artifactId, String(req.params.assetId))
  if (!asset) { res.sendStatus(404); return }
  res.set({ 'Content-Type': asset.contentType, 'Content-Security-Policy': assetCsp, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).end(asset.bytes)
}))
