import { createHash } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { pool } from '../../db/pool.js'
import { permissionService } from '../access/public.js'
import { storage } from '../../storage.js'
import { readGrant, type EditorGrant } from './grants.js'
import { ARTIFACT_KIND_DEFINITIONS, artifactKind, type ArtifactKindDefinition } from './kinds.js'
import { blobFile, contentTypeOf, readProjectFile } from './store.js'
import { ensureNativeDocument, readNativeDocument, readNativeOriginal, readNativeOriginalResource, readNativePage, readNativeRevision } from './native-document.js'
import { withTransaction } from '../../db/transaction.js'

const BLOB_PATH = /^_blob\/([0-9a-f]{32})$/
const DATA_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
function sendJson(response: Response, status: number, body: unknown) {
  response.status(status).set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).json(body)
}
const publishError = (response: Response, status: number, code: string, message: string) => sendJson(response, status, { code, message })

/** A main-site (opaque) editor reaches its own routes cross-origin; the grant in the path is the credential. */
function cors(response: Response) {
  response.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600', 'Cross-Origin-Resource-Policy': 'cross-origin' })
}

interface EditorSession { grant: EditorGrant; definition: ArtifactKindDefinition; session: string }

/** Every request checks the signed scope and current tenant permission. */
async function authorizeGrant(token: string, kind: string): Promise<EditorSession | null> {
  const grant = readGrant(token)
  if (!grant || grant.kind !== kind) return null
  const decision = await permissionService.can({ actorUserId: grant.userId, companyId: grant.companyId,
    action: 'artifact:read', resource: { type: 'artifact', id: grant.artifactId } })
  if (!decision.allowed) return null
  const { rows } = await pool.query<{ kind: string }>('SELECT kind FROM artifacts WHERE id=$1 AND company_id=$2', [grant.artifactId, grant.companyId])
  if (rows[0]?.kind !== kind) return null
  return { grant, definition: ARTIFACT_KIND_DEFINITIONS[grant.kind], session: createHash('sha256').update(token).digest('hex').slice(0, 24) }
}

async function serveBlob(request: Request, response: Response, id: string, artifactId?: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.status(405).set('Allow', 'GET, HEAD').end()
    return
  }
  const found = await blobFile(pool, id, artifactId)
  if (!found) {
    response.status(404).set('Cache-Control', 'no-store').end()
    return
  }
  const bytes = await storage.readObjectBounded(found.storageKey, found.size + 1)
  cors(response)
  response.status(200).set({ 'Content-Type': found.contentType, 'Content-Length': String(bytes.length),
    // Addressed by content: an id's bytes never change.
    'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': DATA_CSP })
  response.end(request.method === 'HEAD' ? undefined : bytes)
}

async function route(request: Request, response: Response, session: EditorSession, rest: string) {
  const method = request.method ?? 'GET'
  const { companyId, artifactId, userId } = session.grant
  if (method !== 'GET' && method !== 'HEAD') {
    response.status(405).set('Allow', 'GET, HEAD').end()
    return
  }
  if (rest === 'native/runtime.js') {
    const { nativeEmbedRuntime } = await import('./native-embed-source.js')
    response.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).end(await nativeEmbedRuntime())
    return
  }
  const nativeEmbed = /^native\/embeds\/([a-zA-Z0-9_-]{1,128})\/([a-zA-Z0-9_-]{1,128})$/.exec(rest)
  if (nativeEmbed) {
    const pageHash = typeof request.query.pageHash === 'string' ? request.query.pageHash : undefined
    const revisionSeq=request.query.revisionSeq
    if(revisionSeq!==undefined&&(typeof revisionSeq!=='string'||!/^\d{1,18}$/.test(revisionSeq))){response.sendStatus(400);return}
    let page = revisionSeq!==undefined?(await readNativeRevision(pool,{artifactId,companyId,seq:revisionSeq})).document.pages[nativeEmbed[1]]??null:await readNativePage(pool, artifactId, nativeEmbed[1], pageHash)
    let original = (await readNativeDocument(pool, artifactId))?.original
    if (!page && !pageHash && revisionSeq===undefined) {
      const converted = await ensureNativeDocument({ db: pool, transaction: run => withTransaction(pool, run) }, { artifactId, companyId, actorId: userId, write: false })
      page = converted.document.pages[nativeEmbed[1]] ?? null
      original = converted.original
    }
    const embed = page?.nodes[nativeEmbed[2]]?.embed
    if (!embed) { response.sendStatus(404); return }
    const hash = createHash('sha256').update(embed.source).digest('hex')
    if (request.query.sha256 !== hash) { response.status(409).end('The embedded content changed. Refresh the page.'); return }
    const nonce = typeof request.query.nonce === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(request.query.nonce) ? request.query.nonce : session.session
    const runtimeUrl = `${request.baseUrl}${request.path.slice(0, request.path.indexOf('/native/'))}/native/runtime.js`
    const { renderNativeEmbedSource } = await import('./native-embed-source.js')
    const originalDirectory = embed.originalPath?.includes('/') ? embed.originalPath.slice(0, embed.originalPath.lastIndexOf('/') + 1) : ''
    const resourceVersion = embed.resourceVersion ?? original?.version
    const resourceBaseUrl = resourceVersion && embed.originalPath ? `${request.baseUrl}${request.path.slice(0, request.path.indexOf('/native/'))}/native/original-resources/${resourceVersion}/${originalDirectory}` : undefined
    const html = await renderNativeEmbedSource(embed.source, embed.format, { runtimeUrl, nonce, ...(resourceBaseUrl ? { resourceBaseUrl } : {}) })
    response.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'" }).end(method === 'HEAD' ? undefined : html)
    return
  }
  const nativeAsset = /^native\/assets\/([a-f0-9]{32})$/.exec(rest)
  if (nativeAsset) return serveBlob(request, response, nativeAsset[1], artifactId)
  const nativeOriginal = /^native\/originals\/([a-f0-9]{64})\/(.+)$/.exec(rest)
  if (nativeOriginal) {
    const original = await readNativeOriginal(pool, artifactId, nativeOriginal[1], nativeOriginal[2])
    if (!original) { response.sendStatus(404); return }
    response.set({ 'Content-Type': original.contentType, 'Content-Security-Policy': DATA_CSP, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).end(method === 'HEAD' ? undefined : original.bytes)
    return
  }
  const originalResource = /^native\/original-resources\/(local-[a-f0-9]{16})\/(.+)$/.exec(rest)
  if (originalResource) {
    const resource = await readNativeOriginalResource(pool, artifactId, originalResource[1], originalResource[2])
    if (!resource) { response.sendStatus(404); return }
    if (request.query.component === '1' && originalResource[2].endsWith('.dc.html')) {
      const { renderNativeDcModule } = await import('./native-embed-source.js')
      const module = await renderNativeDcModule(resource.bytes.toString('utf8'), `${request.baseUrl}${request.path}`)
      response.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).end(method === 'HEAD' ? undefined : module)
      return
    }
    response.set({ 'Content-Type': resource.contentType, 'Content-Security-Policy': DATA_CSP, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).end(method === 'HEAD' ? undefined : resource.bytes)
    return
  }
  if (rest.startsWith('project/')) {
    const bytes = await readProjectFile(pool, session.definition, artifactId, rest)
    if (bytes === null) {
      response.status(404).set('Cache-Control', 'no-store').end()
      return
    }
    response.status(200).set({ 'Content-Type': contentTypeOf(rest), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': DATA_CSP })
    response.end(method === 'HEAD' ? undefined : bytes)
    return
  }
  const blob = BLOB_PATH.exec(rest)
  if (blob) return serveBlob(request, response, blob[1], artifactId)
  response.sendStatus(404)
}

async function guard(response: Response, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    const status = (error as { status?: number }).status
    if (!response.headersSent && status && status < 500) return publishError(response, status, (error as { code?: string }).code ?? 'invalid_content', (error as Error).message)
    console.error('[artifact-editor] request failed', error instanceof Error ? error.name : 'error')
    if (!response.headersSent) publishError(response, 500, 'upstream_error', 'internal error')
    else response.destroy()
  }
}

export const artifactEditorRouter = Router()

artifactEditorRouter.use((request, response, next) => {
  cors(response)
  if (request.method === 'OPTIONS') { response.status(204).end(); return }
  next()
})

// Only the small isolated-content runtime is public. The retired editor bundles are never served.
artifactEditorRouter.get('/native-embed-runtime.js', (request, response) => {
  void guard(response, async () => {
    const { nativeEmbedRuntime } = await import('./native-embed-source.js')
    const runtime = await nativeEmbedRuntime()
    response.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
      .end(request.method === 'HEAD' ? undefined : runtime)
  })
})

artifactEditorRouter.all(/^\/([a-z-]+)\/([^/]+)(\/.*)?$/, (request, response) => {
  const match = /^\/([a-z-]+)\/([^/]+)(\/.*)?$/.exec(request.path)!
  const [, kind, token, tail] = match
  if (tail === undefined) {
    const search = request.originalUrl.includes('?') ? request.originalUrl.slice(request.originalUrl.indexOf('?')) : ''
    response.status(308).set({ Location: `${request.baseUrl}/${kind}/${token}/${search}`, 'Cache-Control': 'no-store' }).end()
    return
  }
  let rest: string
  try { rest = decodeURIComponent(tail.slice(1)) } catch { response.status(400).end(); return }
  void guard(response, async () => {
    artifactKind(kind)
    const session = await authorizeGrant(token, kind)
    if (!session) {
      request.resume()
      response.status(404).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Not found')
      return
    }
    await route(request, response, session, rest)
  })
})

/** Files reference uploads as root-absolute /_blob/<id>; the id is bound to its artifact by the host secret. */
export const artifactBlobRouter = Router()
artifactBlobRouter.all(/^\/([0-9a-f]{32})$/, (request, response) => {
  void guard(response, () => serveBlob(request, response, request.path.slice(1)))
})
