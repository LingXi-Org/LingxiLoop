import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router, type Request, type Response } from 'express'
import { pool } from '../../db/pool.js'
import { permissionService } from '../access/public.js'
import { storage } from '../../storage.js'
import { CommentsError, readEdit, readNewThread, readReply, readStatus } from './comments.js'
import { onArtifactEvent } from './events.js'
import {
  createComment, deleteComment, editComment, listComments, publishArtifactFiles, replyComment, sendComment, setCommentStatus,
} from './facade.js'
import { readGrant, type EditorGrant } from './grants.js'
import { ARTIFACT_KIND_DEFINITIONS, BAOYU_DESIGN_ROOT, artifactKind, type ArtifactKindDefinition } from './kinds.js'
import { blobFile, contentTypeOf, isWireEntry, listing, putBlob, readProjectFile, type WireEntry } from './store.js'
import { availableAgents } from './repository.js'
import { EDITOR_DOWNLOAD_SCRIPT } from './editor-downloads.js'
import { slideWorkspaceConversation } from './slides-workspace.js'

// Ported from baoyu-design server.mjs `startServer`/`route`: the same routes under
// /artifact-editor/<kind>/<grant>/, with the folder replaced by the artifact store,
// the loopback grant by a signed grant and fs.watch by artifact events.
const ROUTES = { listing: '_files.json', publish: '__deck/publish', assets: '__deck/assets', events: '__deck/events', session: '__deck/session' }
const COMMENTS_ROUTE = '__comments'
const SLIDES_EDITOR_ROOT = fileURLToPath(new URL('../../../assets/slides-editor/', import.meta.url))
const BLOB_PATH = /^_blob\/([0-9a-f]{32})$/
const DATA_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
const MAX_PUBLISH_BYTES = 64 * 1024 * 1024
const MAX_COMMENT_BYTES = 256 * 1024
const SSE_KEEPALIVE_MS = 25e3
const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.map': 'application/json; charset=utf-8',
}

class TooLarge extends Error {}

/** Upstream's page policy, plus `sandbox`: the page has an opaque origin even when opened directly. */
function pageCsp(scriptSrc: string) {
  const fonts = 'https://fonts.googleapis.com https://fonts.gstatic.com'
  return [
    'sandbox allow-scripts allow-downloads allow-popups allow-modals',
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' data: blob: ${fonts}`,
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
}

function sendJson(response: Response, status: number, body: unknown) {
  response.status(status).set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).json(body)
}
const publishError = (response: Response, status: number, code: string, message: string) => sendJson(response, status, { code, message })

function readBody(request: Request, limit: number): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    // A body parser mounted before this router would leave nothing to read.
    if (request.readableEnded) {
      rejectBody(new Error('request body was already consumed'))
      return
    }
    const declared = Number(request.headers['content-length'])
    if (Number.isFinite(declared) && declared > limit) {
      rejectBody(new TooLarge())
      request.resume()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        rejectBody(new TooLarge())
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolveBody(Buffer.concat(chunks)))
    request.on('error', rejectBody)
  })
}

async function readJson(request: Request) {
  if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) {
    request.resume()
    throw new CommentsError('INVALID_CONTENT', 'expected application/json', 415)
  }
  const raw = await readBody(request, MAX_COMMENT_BYTES)
  try { return JSON.parse(raw.toString('utf8') || 'null') as unknown } catch { throw new CommentsError('INVALID_CONTENT', 'malformed JSON', 400) }
}

/** The opaque-origin editor reaches its own routes cross-origin; the grant in the path is the credential. */
function cors(response: Response) {
  response.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,last-event-id', 'Access-Control-Max-Age': '600', 'Cross-Origin-Resource-Policy': 'cross-origin' })
}

interface EditorSession { grant: EditorGrant; definition: ArtifactKindDefinition; session: string; userName: string }

/** Every request re-checks the grant and the person's current access, so revocation applies within one request. */
async function authorizeGrant(token: string, kind: string, writing: boolean): Promise<EditorSession | null> {
  const grant = readGrant(token)
  if (!grant || grant.kind !== kind || (writing && !grant.write)) return null
  const decision = await permissionService.can({ actorUserId: grant.userId, companyId: grant.companyId,
    action: writing ? 'artifact:write' : 'artifact:read', resource: { type: 'artifact', id: grant.artifactId } })
  if (!decision.allowed) return null
  const { rows } = await pool.query<{ kind: string; name: string | null }>(`SELECT artifact.kind,COALESCE(participant.name,account.display_name) AS name
    FROM artifacts artifact LEFT JOIN users account ON account.id=$3
    LEFT JOIN participants participant ON participant.id=$3 AND participant.company_id=artifact.company_id
    WHERE artifact.id=$1 AND artifact.company_id=$2`, [grant.artifactId, grant.companyId, grant.userId])
  if (rows[0]?.kind !== kind) return null
  return { grant, definition: ARTIFACT_KIND_DEFINITIONS[grant.kind], session: createHash('sha256').update(token).digest('hex').slice(0, 24),
    userName: (rows[0].name ?? 'you').slice(0, 100) }
}

async function agentPresence(session: EditorSession) {
  const { rows } = await pool.query<{ conversation_id: string | null; kind: 'design' | 'slides' }>('SELECT conversation_id,kind FROM artifacts WHERE id=$1', [session.grant.artifactId])
  const conversationId = rows[0] ? await slideWorkspaceConversation(pool, session.grant.artifactId, rows[0].conversation_id) : null
  const available = Boolean(conversationId && (await availableAgents(pool, session.grant.companyId, conversationId, rows[0].kind)).length)
  return { available, listening: false, busy: false, hook: available }
}

async function commentsSnapshot(session: EditorSession) {
  const { doc } = await listComments(session.grant.companyId, session.grant.artifactId, true)
  return { threads: doc.threads, agent: await agentPresence(session), me: { name: session.userName } }
}

async function serveEditor(request: Request, response: Response, definition: ArtifactKindDefinition, rest: string) {
  const editorDir = definition.kind === 'slides' ? SLIDES_EDITOR_ROOT : resolve(BAOYU_DESIGN_ROOT, definition.skillDirectory, 'scripts', 'editor')
  const parts = rest === '' ? ['index.html'] : rest.split('/')
  const invalid = parts.some(p => p === '' || p === '.' || p === '..' || p.startsWith('.') || p.includes('\\')) || parts[0] === 'node'
  const realDist = invalid ? null : await realpath(editorDir).catch(() => null)
  const file = realDist === null ? null : join(realDist, ...parts)
  const real = file === null ? null : await realpath(file).catch(() => null)
  const info = real === null ? null : await lstat(real).catch(() => null)
  if (file === null || real !== file || !info?.isFile()) {
    response.status(404).set('Cache-Control', 'no-store').end()
    return
  }
  const ext = extname(file).toLowerCase()
  const type = STATIC_TYPES[ext] ?? 'application/octet-stream'
  const bytes = await readFile(file)
  if (ext === '.html') {
    const html = bytes.toString('utf8').replace('</head>', `<script>${EDITOR_DOWNLOAD_SCRIPT}</script></head>`)
    response.status(200).set({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': pageCsp(definition.pageScriptSrc(html)) })
    response.end(request.method === 'HEAD' ? undefined : html)
    return
  }
  response.status(200).set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
    // The page's build names its assets by content hash.
    'Cache-Control': parts[0] === 'assets' ? 'private, max-age=31536000, immutable' : 'no-cache' })
  response.end(request.method === 'HEAD' ? undefined : bytes)
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

async function canStream(response: Response, { grant }: EditorSession) {
  if (response.writableEnded) return false
  if (grant.expiresAt <= Date.now() || !(await permissionService.can({ actorUserId: grant.userId, companyId: grant.companyId,
    action: 'artifact:read', resource: { type: 'artifact', id: grant.artifactId } })).allowed) {
    response.end()
    return false
  }
  return !response.writableEnded
}

function events(request: Request, response: Response, session: EditorSession) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' })
  response.write(': connected\n\n')
  const artifactId = session.grant.artifactId
  void (async () => {
    const { rows } = await pool.query<{ seq: string }>('SELECT seq FROM artifacts WHERE id=$1', [artifactId])
    const seq = Number(rows[0]?.seq ?? 0)
    const last = /^(\d+)$/.exec(String(request.headers['last-event-id'] ?? ''))
    if (last && Number(last[1]) < seq) {
      // Missed saves while disconnected: the listing names every file the page must reread.
      const current = await listing(pool, artifactId)
      if (!await canStream(response, session)) return
      response.write(`id: ${seq}\nevent: external-change\ndata: ${JSON.stringify({ type: 'external-change', paths: Object.keys(current.files), ver: current.ver })}\n\n`)
    } else if (await canStream(response, session)) response.write(`id: ${seq}\n\n`)
  })().catch(() => response.end())
  const stop = onArtifactEvent(artifactId, event => {
    if (event.kind === 'artifact.deleted') { response.end(); return }
    if (event.kind !== 'files.changed' || event.origin === session.session) return
    void pool.query<{ seq: string }>('SELECT seq FROM artifacts WHERE id=$1', [artifactId]).then(async ({ rows }) => {
      if (!await canStream(response, session)) return
      response.write(`id: ${rows[0]?.seq ?? 0}\nevent: external-change\ndata: ${JSON.stringify({ type: 'external-change', paths: event.paths ?? [], ver: event.ver })}\n\n`)
    }).catch(() => response.end())
  })
  const keepAlive = setInterval(() => {
    void canStream(response, session).then(allowed => { if (allowed) response.write(': ping\n\n') }).catch(() => response.end())
  }, SSE_KEEPALIVE_MS)
  keepAlive.unref?.()
  const done = () => { clearInterval(keepAlive); stop() }
  request.on('close', done)
  response.on('close', done)
}

function commentEvents(request: Request, response: Response, session: EditorSession) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' })
  response.write(': connected\n\n')
  let lastSent = ''
  const push = () => commentsSnapshot(session).then(async snap => {
    if (!await canStream(response, session)) return
    const text = `event: comments\ndata: ${JSON.stringify(snap)}\n\n`
    if (text === lastSent) return
    lastSent = text
    response.write(text)
  }).catch(() => response.end())
  void push()
  const stop = onArtifactEvent(session.grant.artifactId, event => { if (event.kind === 'comments.changed') void push() })
  const keepAlive = setInterval(() => {
    void canStream(response, session).then(allowed => { if (allowed) response.write(': ping\n\n') }).catch(() => response.end())
  }, SSE_KEEPALIVE_MS)
  keepAlive.unref?.()
  const done = () => { clearInterval(keepAlive); stop() }
  request.on('close', done)
  response.on('close', done)
}

async function comments(request: Request, response: Response, session: EditorSession, rest: string) {
  const method = request.method ?? 'GET'
  const parts = rest.split('/').filter(Boolean)
  const reading = method === 'GET' || method === 'HEAD'
  const { companyId, artifactId, userId } = session.grant
  const author = { kind: 'user' as const, name: session.userName, id: userId }
  try {
    if (parts.length === 0) {
      if (reading) return sendJson(response, 200, await commentsSnapshot(session))
      if (method === 'POST') {
        const input = readNewThread(await readJson(request))
        if (!input) throw new CommentsError('INVALID_COMMENT', 'expected {anchor, label, text} with a non-empty text')
        return sendJson(response, 201, { thread: await createComment({ companyId, artifactId, author, thread: input }) })
      }
    } else if (parts.length === 1 && parts[0] === 'events') {
      if (reading) return commentEvents(request, response, session)
    } else if (parts.length === 2 && parts[0] === 'agent' && parts[1] === 'wait') {
      // The agent receives sent comments as conversation messages; nothing waits here.
      if (reading) return sendJson(response, 200, { threads: [] })
    } else if (parts.length === 1) {
      const id = parts[0]
      if (method === 'PATCH') {
        const status = readStatus(await readJson(request))
        if (!status) throw new CommentsError('INVALID_STATUS', 'expected {status: "open" | "resolved"}')
        return sendJson(response, 200, { thread: await setCommentStatus({ companyId, artifactId, commentId: id, status }) })
      }
      if (method === 'DELETE') {
        await deleteComment({ companyId, artifactId, commentId: id })
        return sendJson(response, 200, { deleted: id })
      }
    } else if (parts.length === 2 && parts[1] === 'messages') {
      if (method === 'POST') {
        const input = readReply(await readJson(request))
        if (!input) throw new CommentsError('INVALID_COMMENT', 'expected {text} with a non-empty text')
        return sendJson(response, 200, { thread: await replyComment({ companyId, artifactId, author, commentId: parts[0], text: input.text, send: input.send }) })
      }
    } else if (parts.length === 3 && parts[1] === 'messages') {
      if (method === 'PATCH') {
        const input = readEdit(await readJson(request))
        if (!input) throw new CommentsError('INVALID_COMMENT', 'expected {text} with a non-empty text')
        return sendJson(response, 200, { thread: await editComment({ companyId, artifactId, author, commentId: parts[0], messageId: parts[2], text: input.text, send: input.send }) })
      }
    } else if (parts.length === 2 && parts[1] === 'send') {
      if (method === 'POST') {
        request.resume()
        return sendJson(response, 200, { thread: await sendComment({ companyId, artifactId, author, commentId: parts[0] }) })
      }
    } else {
      return sendJson(response, 404, { code: 'NOT_FOUND', message: 'no such comments route' })
    }
    request.resume()
    sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: `${method} is not allowed here` })
  } catch (error) {
    if (response.headersSent) throw error
    if (error instanceof CommentsError) return sendJson(response, error.status, { code: error.code, message: error.message })
    const status = (error as { status?: number }).status
    if (status === 409) return sendJson(response, 409, { code: 'NOTHING_TO_SEND', message: (error as Error).message })
    if (error instanceof TooLarge) return sendJson(response, 413, { code: 'TOO_LARGE', message: 'request body is too large' })
    throw error
  }
}

async function route(request: Request, response: Response, session: EditorSession, rest: string) {
  const method = request.method ?? 'GET'
  const { companyId, artifactId, userId } = session.grant
  if (rest === COMMENTS_ROUTE || rest.startsWith(`${COMMENTS_ROUTE}/`)) return comments(request, response, session, rest.slice(COMMENTS_ROUTE.length))
  if (rest === ROUTES.publish || rest === ROUTES.assets) {
    if (method !== 'POST') {
      response.status(405).set('Allow', 'POST').end()
      return
    }
    if (rest === ROUTES.publish) {
      if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) return publishError(response, 415, 'invalid_content', 'expected application/json')
      const raw = await readBody(request, MAX_PUBLISH_BYTES)
      let files: Record<string, WireEntry>
      try {
        const body = JSON.parse(raw.toString('utf8')) as { files?: unknown }
        if (typeof body?.files !== 'object' || body.files === null || Array.isArray(body.files)) throw new Error('files')
        if (!Object.values(body.files).every(isWireEntry)) throw new Error('entry')
        files = body.files as Record<string, WireEntry>
      } catch {
        return publishError(response, 400, 'invalid_content', 'malformed publish request')
      }
      const outcome = await publishArtifactFiles({ companyId, artifactId, actorId: userId, actorKind: 'user', files, origin: session.session })
      return sendJson(response, outcome.status, outcome.body)
    }
    const contentType = request.headers['content-type'] ?? 'application/octet-stream'
    if (session.definition.kind === 'slides' && /^video\//i.test(contentType)) {
      return publishError(response, 415, 'invalid_content', 'video uploads are not supported')
    }
    const bytes = await readBody(request, session.definition.layout.maxBlobBytes)
    if (bytes.length === 0) return publishError(response, 400, 'invalid_content', 'empty upload')
    return sendJson(response, 200, await putBlob(pool, session.definition, artifactId, bytes, contentType))
  }
  if (method !== 'GET' && method !== 'HEAD') {
    response.status(405).set('Allow', 'GET, HEAD').end()
    return
  }
  if (rest === ROUTES.listing) return sendJson(response, 200, await listing(pool, artifactId))
  if (rest === ROUTES.session) return sendJson(response, 200, { canEdit: session.grant.write })
  if (rest === ROUTES.events) return events(request, response, session)
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
  return serveEditor(request, response, session.definition, rest)
}

async function guard(response: Response, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    if (error instanceof TooLarge) {
      if (!response.headersSent) publishError(response, 413, 'too_large', 'request body is too large')
      return
    }
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

// Public, content-hashed application assets can be reused across grants/decks.
// Document files, uploads and editor pages still require their existing grants.
artifactEditorRouter.get(/^\/slides-assets\/([A-Za-z0-9_-]+\.(?:js|css|woff2))$/, (request, response) => {
  const name = request.path.slice('/slides-assets/'.length)
  void guard(response, () => serveEditor(request, response, ARTIFACT_KIND_DEFINITIONS.slides, `assets/${name}`))
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
    const writing = !['GET', 'HEAD'].includes(request.method)
    const session = await authorizeGrant(token, kind, writing)
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
