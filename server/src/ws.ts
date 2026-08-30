import { WebSocketServer, type WebSocket } from 'ws'
import type { Server } from 'node:http'
import {
  sub,
  CH_STATUS,
  CH_GROUP_PULLED, CH_CONVO_UPDATED, CH_CONVENE,
  CH_DOCS, CH_DOC_ACCESS_REVOKED, CH_CANVAS, CH_CALENDAR_REMINDER, CH_CALENDAR_EVENTS, CH_DOC_MENTION, CH_AGENT_ACTIVITY,
  CH_IM_READ_RECEIPTS,
} from './redis.js'
import { env } from './env.js'
import { consumeWsTicket } from './modules/identity/public.js'
import { participantPresenceApplication } from './modules/agents/index.js'
import { pool } from './db/pool.js'
import {
  subscribe as docSubscribe,
  unsubscribe as docUnsubscribe,
  applyLocalUpdate as docApplyLocalUpdate,
  broadcastAwareness as docBroadcastAwareness,
  notifyDocumentMention,
  projectDocumentIds,
  type DocSubscriber,
} from './modules/documents/public.js'
import { randomUUID } from 'node:crypto'
import { permissionService } from './modules/access/public.js'

interface AuthedSocket {
  ws: WebSocket
  userId: string
  /** Stable per-socket id used as the Yjs update origin. Lets the room
   *  manager echo-suppress on this client's own outbound updates. */
  originId: string
  /** Set of company_ids this user is a member of. Refreshed on connect; the
   *  WS bridge uses it to filter Redis events tagged with `companyId`. */
  companies: Set<string>
  /** Active doc subscriptions on this socket. Released on close. */
  docSubs: Map<string, DocSubscriber>
  /** Heartbeat liveness flag. Set true on every received pong; the periodic
   *  ping loop flips it to false right before sending the next ping. If the
   *  next round still sees false, the socket is half-open and we terminate
   *  it — that triggers the 'close' handler, which decrements the
   *  presence counter and flips the user to 'resting'. Without this,
   *  laptop sleeps / network drops would leave 'avail' stuck until the
   *  OS finally noticed the dead TCP. */
  isAlive: boolean
}

const clients = new Set<AuthedSocket>()

/** Force clients to refresh membership state after an administrator removes a
 * user. A reconnect obtains a fresh ticket and company set, so stale sockets
 * cannot keep receiving default Project events from the removed company. */
export function disconnectUserFromCompany(userId: string, companyId: string): void {
  for (const client of clients) {
    if (client.userId !== userId || !client.companies.has(companyId)) continue
    client.companies.delete(companyId)
    client.ws.close(4403, 'company membership removed')
  }
}

/** Revoke live collaborative-document subscriptions after a course member is
 * removed. The socket remains connected for the user's other workspaces, but
 * every room in the removed Project is detached before the API confirms the
 * removal, so an already-open tab cannot keep receiving document updates. */
export async function revokeUserProjectDocumentSubscriptions(
  userId: string,
  companyId: string,
  projectId: string,
): Promise<void> {
  const projectDocuments = new Set(await projectDocumentIds(companyId, projectId))
  if (projectDocuments.size === 0) return
  for (const client of clients) {
    if (client.userId !== userId) continue
    for (const documentId of projectDocuments) {
      const subscriber = client.docSubs.get(documentId)
      if (!subscriber) continue
      docUnsubscribe(documentId, subscriber)
      client.docSubs.delete(documentId)
    }
  }
}

// Per-client WebSocket send backpressure caps (OOM fix). A socket that can't
// drain makes `ws` buffer unsent frames in process memory; without a cap, a high
// broadcast rate grows that buffer unbounded across clients until the pod OOMs.
// Above MAX we stop sending new frames to that client (let it drain); above
// TERMINATE it's hopelessly behind, so we kill it to reclaim the memory (it
// reconnects + re-syncs via REST).
const WS_MAX_BUFFERED_BYTES = 2 * 1024 * 1024        // 2 MB
const WS_TERMINATE_BUFFERED_BYTES = 8 * 1024 * 1024  // 8 MB

/** Open WS connections per user. Drives real human presence:
 *   - 0 → 1  : user is now online, flip participant status to 'avail'.
 *   - 1 → 0  : user just went offline, flip to 'resting'.
 *  Multiple tabs / windows / devices coalesce on the same userId so
 *  presence stays "online" until the last one closes. */
const humanConnections = new Map<string, number>()

/** Called once at server boot. Demotes every human participant that's
 *  still flagged 'avail' from a previous run — those flags would otherwise
 *  persist as stale presence until that user reconnects/disconnects.
 *  Agents are handled by their own runtime lease + the GET /participants
 *  auto-expiry, so we leave their status alone here. */
export async function resetHumanPresenceOnBoot(): Promise<void> {
  const result = await participantPresenceApplication.resetOnBoot()
  if (result.updated > 0) {
    console.log(`[ws] demoted ${result.updated} stale 'avail' human(s) to 'resting' on boot`)
  }
  if (result.publishFailures > 0) {
    console.warn(`[ws] ${result.publishFailures} presence reset event(s) await client refresh`)
  }
}

const humanPresenceTransitions = new Map<string, Promise<void>>()

function queueHumanPresenceTransition(userId: string, work: () => Promise<void>): Promise<void> {
  const previous = humanPresenceTransitions.get(userId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(work)
  humanPresenceTransitions.set(userId, next)
  void next.finally(() => {
    if (humanPresenceTransitions.get(userId) === next) humanPresenceTransitions.delete(userId)
  }).catch(() => undefined)
  return next
}

function onHumanConnect(userId: string, companies: ReadonlySet<string>): Promise<void> {
  const cur = humanConnections.get(userId) ?? 0
  humanConnections.set(userId, cur + 1)
  if (cur !== 0) return Promise.resolve()
  return queueHumanPresenceTransition(userId, async () => {
    try {
      await participantPresenceApplication.setHumanPresence({
        companyIds: [...companies], participantId: userId, status: 'avail',
      })
    } catch (e) { console.warn(`[ws] set human presence avail failed for ${userId}`, e) }
  })
}

function onHumanDisconnect(userId: string): Promise<void> {
  const cur = humanConnections.get(userId) ?? 0
  if (cur <= 1) {
    humanConnections.delete(userId)
    return queueHumanPresenceTransition(userId, async () => {
      if (humanConnections.has(userId)) return
      try {
        const companies = await loadMemberships(userId)
        if (humanConnections.has(userId)) return
        await participantPresenceApplication.setHumanPresence({
          companyIds: [...companies], participantId: userId, status: 'resting',
        })
      } catch (e) { console.warn(`[ws] set human presence resting failed for ${userId}`, e) }
    })
  } else {
    humanConnections.set(userId, cur - 1)
    return Promise.resolve()
  }
}

async function loadMemberships(userId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM company_memberships WHERE user_id = $1 AND status='ACTIVE'`,
    [userId],
  )
  const decisions = await Promise.all(rows.map(async (row) => ({
    companyId: row.company_id,
    decision: await permissionService.can({
      actorUserId: userId,
      action: 'company:read',
      companyId: row.company_id,
    }),
  })))
  return new Set(decisions.filter(({ decision }) => decision.allowed).map(({ companyId }) => companyId))
}

/** Look up a doc + verify the caller's tenant membership in one shot.
 *  Returns null when the doc doesn't exist OR the caller can't see it —
 *  same opaque posture the chat handlers use to avoid leaking existence. */
async function docCompanyFor(documentId: string, userId: string, writable = false): Promise<string | null> {
  const decision = await permissionService.can({
    actorUserId: userId,
    action: writable ? 'document:write' : 'document:read',
    resource: { type: 'document', id: documentId },
  })
  return decision.allowed ? decision.context?.company.id ?? null : null
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return
  try { ws.send(JSON.stringify(payload)) } catch { /* ignore */ }
}

async function handleDocFrame(c: AuthedSocket, msg: Record<string, unknown>): Promise<void> {
  const type = msg.type as string | undefined
  const documentId = typeof msg.documentId === 'string' ? msg.documentId : null
  if (!documentId) return

  if (type === 'doc.subscribe') {
    if (c.docSubs.has(documentId)) return  // idempotent
    const companyId = await docCompanyFor(documentId, c.userId)
    if (!companyId) {
      sendJson(c.ws, { type: 'doc.error', documentId, error: 'not found' })
      return
    }
    const subRec: DocSubscriber = {
      originId: c.originId,
      onUpdate: (update, originId) => {
        sendJson(c.ws, {
          type: 'doc.update',
          documentId,
          updateB64: Buffer.from(update).toString('base64'),
          originId,
        })
      },
      onAwareness: (update, originId) => {
        sendJson(c.ws, {
          type: 'doc.awareness',
          documentId,
          updateB64: Buffer.from(update).toString('base64'),
          originId,
        })
      },
    }
    const { initialState } = await docSubscribe(documentId, companyId, subRec)
    c.docSubs.set(documentId, subRec)
    sendJson(c.ws, {
      type: 'doc.sync',
      documentId,
      stateB64: Buffer.from(initialState).toString('base64'),
      originId: c.originId,
    })
    return
  }

  if (type === 'doc.unsubscribe') {
    const subRec = c.docSubs.get(documentId)
    if (!subRec) return
    docUnsubscribe(documentId, subRec)
    c.docSubs.delete(documentId)
    return
  }

  if (type === 'doc.update') {
    const subRec = c.docSubs.get(documentId)
    if (!subRec) return  // must subscribe first
    const updateB64 = typeof msg.updateB64 === 'string' ? msg.updateB64 : ''
    if (!updateB64) return
    const companyId = await docCompanyFor(documentId, c.userId, true)
    if (!companyId) return
    const buf = Buffer.from(updateB64, 'base64')
    const update = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    await docApplyLocalUpdate(documentId, companyId, c.originId, c.userId, update)
    return
  }

  if (type === 'doc.awareness') {
    const subRec = c.docSubs.get(documentId)
    if (!subRec) return
    const updateB64 = typeof msg.updateB64 === 'string' ? msg.updateB64 : ''
    if (!updateB64) return
    const companyId = await docCompanyFor(documentId, c.userId)
    if (!companyId) return
    const buf = Buffer.from(updateB64, 'base64')
    const update = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    await docBroadcastAwareness(documentId, companyId, c.originId, update)
    return
  }

  if (type === 'doc.mention.notify') {
    const rawIds = msg.mentionedIds
    if (!Array.isArray(rawIds) || rawIds.length === 0) return
    const requestedIds = rawIds.filter((x): x is string => typeof x === 'string')
    if (requestedIds.length === 0) return
    const companyId = await docCompanyFor(documentId, c.userId)
    if (!companyId) return
    await notifyDocumentMention({
      documentId, companyId, mentionerId: c.userId, requestedIds,
    })
    return
  }
}

export function attachWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', async (ws, req) => {
    const ip = req.socket.remoteAddress
    // The WS connect URL carries a SHORT-LIVED one-shot ticket
    // (?t=<ws-ticket>), not the session token. Tickets are minted via
    // POST /auth/ws-ticket and consumed atomically here. This keeps
    // session tokens out of URLs / access logs / referrer headers.
    let ticket: string | undefined
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const t = url.searchParams.get('t')
      if (t) ticket = t
    } catch { /* ignore */ }

    if (!ticket) {
      console.log(`[ws] rejecting unauthenticated connection (${ip})`)
      try { ws.close(4401, 'missing ws ticket') } catch { /* ignore */ }
      return
    }
    const session = await consumeWsTicket(ticket)
    if (!session) {
      console.log(`[ws] rejecting bad/expired/used ticket (${ip})`)
      try { ws.close(4401, 'invalid ws ticket') } catch { /* ignore */ }
      return
    }

    const companies = await loadMemberships(session.userId)
    const c: AuthedSocket = {
      ws,
      userId: session.userId,
      originId: randomUUID(),
      companies,
      docSubs: new Map(),
      isAlive: true,
    }
    clients.add(c)
    // Browsers auto-respond to ws.ping() with pong at the protocol level —
    // no JS involvement on the client side. The pong handler here is the
    // server's only signal that the socket is still alive end-to-end.
    ws.on('pong', () => { c.isAlive = true })
    console.log(`[ws] client connected (${ip}, user=${session.userId}, companies=${companies.size}) · total ${clients.size}`)
    void onHumanConnect(session.userId, companies)

    // Single-fire disconnect handler — both 'close' and 'error' route
    // through here so we never double-decrement the connection counter.
    let released = false
    const release = () => {
      if (released) return
      released = true
      for (const [docId, subRec] of c.docSubs) docUnsubscribe(docId, subRec)
      c.docSubs.clear()
      clients.delete(c)
      void onHumanDisconnect(session.userId)
    }

    try {
      ws.send(JSON.stringify({ type: 'hello', instanceId: env.INSTANCE_ID, ts: Date.now() }))
    } catch { /* ignore */ }

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown> } catch { return }
      const type = typeof msg.type === 'string' ? msg.type : ''
      if (type.startsWith('doc.')) {
        void handleDocFrame(c, msg).catch((e) => {
          console.warn('[ws] doc frame error', e)
          sendJson(ws, { type: 'doc.error', documentId: msg.documentId, error: 'server error' })
        })
      }
      // Other inbound types (ping etc.) would land here later; today the
      // chat protocol is pure REST + broadcast so there's nothing else.
    })

    ws.on('close', () => {
      release()
      console.log(`[ws] client disconnected · total ${clients.size}`)
    })
    ws.on('error', (err) => {
      console.warn('[ws] socket error', err)
      release()
    })
  })

  // Bridge Redis pubsub → local WS fan-out, scoped per company. The doc
  // channels (CH_DOC_UPDATE / CH_DOC_AWARENESS) are intentionally NOT in
  // this list — the room manager handles them, since recipients need to
  // be filtered by doc-subscription, not just company.
  sub.subscribe(
    CH_STATUS,
    CH_GROUP_PULLED, CH_CONVO_UPDATED, CH_CONVENE,
    CH_DOCS, CH_DOC_ACCESS_REVOKED, CH_CANVAS, CH_CALENDAR_REMINDER, CH_CALENDAR_EVENTS, CH_DOC_MENTION, CH_AGENT_ACTIVITY,
    CH_IM_READ_RECEIPTS,
  ).then((count) => {
    console.log(`[ws] subscribed to ${count} redis channels`)
  })

  sub.on('message', (channel, payload) => {
    void (async () => {
    // Doc channels are room-scoped, not company-scoped — skip them here.
    if (channel === 'lingxiloop:doc.update' || channel === 'lingxiloop:doc.awareness') return
    if (channel === CH_DOC_ACCESS_REVOKED) {
      try {
        const event = JSON.parse(payload) as { userId?: string; companyId?: string; workspaceId?: string }
        if (event.userId && event.companyId && event.workspaceId) {
          await revokeUserProjectDocumentSubscriptions(event.userId, event.companyId, event.workspaceId)
        }
      } catch { /* malformed — drop */ }
      return
    }
    // Tenant-aware fan-out: only deliver an event to a socket if the event's
    // companyId is in the socket's set of memberships. Untagged events are
    // dropped (no leakage), since every publisher is expected to tag.
    let companyId: string | undefined
    let parsed: Record<string, unknown>
    let workspaceId: string | undefined
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>
      if (typeof parsed.companyId === 'string') companyId = parsed.companyId
      if (typeof parsed.workspaceId === 'string') workspaceId = parsed.workspaceId
    } catch { /* malformed — drop */ return }

    if (!companyId) {
      // Conservative: untagged events have no tenant — refuse to route.
      // (If an untagged event ever reaches here it's a publisher bug; logging
      // helps catch the gap during the rollout.)
      console.warn('[ws] dropping untagged event')
      return
    }

    let projectViewers: Set<string> | null = null
    if (workspaceId) {
      const candidates = [...clients].filter((client) => client.companies.has(companyId))
      const decisions = await Promise.all(candidates.map(async (client) => ({
        userId: client.userId,
        decision: await permissionService.can({
          actorUserId: client.userId,
          action: 'project:read',
          companyId,
          projectId: workspaceId,
        }),
      })))
      projectViewers = new Set(decisions.filter(({ decision }) => decision.allowed).map(({ userId }) => userId))
    }

    for (const c of clients) {
      if (!c.companies.has(companyId)) continue
      const companyAccess = await permissionService.can({
        actorUserId: c.userId,
        action: 'company:read',
        companyId,
      })
      if (!companyAccess.allowed) {
        c.companies.delete(companyId)
        continue
      }
      if (projectViewers && !projectViewers.has(c.userId)) continue
      let outbound = payload
      if (channel === CH_IM_READ_RECEIPTS) {
        const recipientIds = Array.isArray(parsed.recipientIds)
          ? parsed.recipientIds.filter((value): value is string => typeof value === 'string')
          : []
        if (!recipientIds.includes(c.userId)) continue
        const { recipientIds: _internalRecipients, companyId: _internalCompany, ...publicEvent } = parsed
        outbound = JSON.stringify(publicEvent)
      }
      if (c.ws.readyState !== c.ws.OPEN) continue
      // Backpressure guard (OOM fix): `ws.send()` buffers unsent frames in
      // process memory when a socket can't drain (slow/stuck client). Under a
      // high broadcast rate that buffer grows UNBOUNDED across clients → the pod
      // OOMs. If a socket is backed up past the cap it isn't keeping up — drop
      // this frame for it; if it's wildly backed up, terminate it to reclaim the
      // memory (it reconnects and re-syncs via REST). Bounds WS memory to
      // ~WS_MAX_BUFFERED_BYTES per client.
      const buffered = c.ws.bufferedAmount
      if (buffered > WS_TERMINATE_BUFFERED_BYTES) {
        try { c.ws.terminate() } catch { /* ignore */ }
        continue
      }
      if (buffered > WS_MAX_BUFFERED_BYTES) continue // skip frame; let it drain
      try { c.ws.send(outbound) } catch { /* ignore */ }
    }
    })().catch((error) => console.warn('[ws] event fan-out failed', error))
  })

  // Heartbeat sweeper. Real-deal human presence used to drift because TCP
  // can keep a half-open socket "alive" for many minutes after the
  // laptop sleeps / network drops, so the close handler never fired and
  // the user stayed 'avail' forever. Now we actively ping every 30s; a
  // client that doesn't pong before the NEXT tick is terminated, which
  // routes through the same close handler that decrements the presence
  // counter. End-to-end effect: status flips to 'resting' within ~60s
  // of a real disconnect.
  const HEARTBEAT_MS = 30_000
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.isAlive) {
        // Missed two ticks in a row — kill it. terminate() bypasses the
        // close handshake and fires our 'close' listener immediately.
        try { c.ws.terminate() } catch { /* ignore */ }
        continue
      }
      c.isAlive = false
      try { c.ws.ping() } catch { /* ignore */ }
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()
  wss.on('close', () => clearInterval(heartbeat))

  return wss
}
