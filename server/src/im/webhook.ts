import { createHash, randomUUID } from 'node:crypto'
import express, { Router, type Request, type Response, type NextFunction } from 'express'
import { pool } from '../db/pool.js'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import { resolveLearningAgentRecipients } from './routing.js'
import { wukongClient } from './wukong.js'

export const wukongWebhookRouter = Router()

type RawRequest = Request & { rawBody?: Buffer }

wukongWebhookRouter.use(express.json({
  limit: '2mb',
  verify(req, _res, buffer) { (req as RawRequest).rawBody = Buffer.from(buffer) },
}))

function safe(handler: (req: RawRequest, res: Response) => Promise<void>): (req: RawRequest, res: Response, next: NextFunction) => void {
  return (req, res, next) => { void handler(req, res).catch(next) }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function decodePayload(value: unknown): LingxiMessageV1 {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as LingxiMessageV1
  if (typeof value !== 'string') return { version: 1, kind: 'system', clientMsgNo: '' }
  for (const candidate of [value, Buffer.from(value, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as LingxiMessageV1
    } catch { /* try the next representation */ }
  }
  return { version: 1, kind: 'system', clientMsgNo: '', body: value.slice(0, 4_000) }
}

function internalWebhookAllowed(req: Request): boolean {
  if (process.env.WUKONG_WEBHOOK_ALLOW_UNSIGNED_INTERNAL !== 'true') return false
  const address = req.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('10.')
    || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
    || address.startsWith('::ffff:10.') || address.startsWith('::ffff:192.168.')
    || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(address)
}

wukongWebhookRouter.post('/', safe(async (req, res) => {
  const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))
  const signature = typeof req.headers['x-wukong-signature'] === 'string' ? req.headers['x-wukong-signature'] : undefined
  if (!wukongClient().verifyWebhook(raw, signature) && !internalWebhookAllowed(req)) {
    res.status(401).json({ error: 'invalid webhook signature' }); return
  }
  const root = record(Array.isArray(req.body) ? req.body[0] : req.body)
  const source = record(root.message ?? root.data ?? root)
  const payload = decodePayload(source.payload)
  const eventType = String(req.query.event ?? root.event_type ?? root.event ?? root.type ?? 'message.committed')
  const clientMsgNo = String(source.client_msg_no ?? source.clientMsgNo ?? payload.clientMsgNo ?? '')
  const channelId = String(source.channel_id ?? source.channelId ?? '')
  const fromUid = String(source.from_uid ?? source.fromUid ?? '')
  const eventId = String(root.event_id ?? root.eventId ?? `${eventType}:${channelId}:${clientMsgNo}`)
  if (!eventId || !channelId || !clientMsgNo || !fromUid) { res.status(400).json({ error: 'incomplete WuKong message event' }); return }
  const allowedKinds = new Set(['text', 'attachment', 'system', 'tool_activity', 'approval', 'handoff', 'poll', 'artifact', 'canvas'])
  if (payload.version !== 1 || !allowedKinds.has(payload.kind) || (payload.body?.length ?? 0) > 64 * 1024) {
    res.status(400).json({ error: 'invalid LingxiMessageV1 payload' }); return
  }

  const payloadHash = createHash('sha256').update(raw).digest('hex')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO wukong_webhook_receipts (event_id, event_type, payload_hash)
       VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING`,
      [eventId, eventType, payloadHash],
    )
    const { rows: receipts } = await client.query<{ payload_hash: string; processed_at: string | null }>(
      `SELECT payload_hash, processed_at FROM wukong_webhook_receipts WHERE event_id=$1 FOR UPDATE`,
      [eventId],
    )
    const receipt = receipts[0]
    if (!receipt) throw new Error('failed to lock WuKong webhook receipt')
    if (receipt.payload_hash !== payloadHash) {
      throw Object.assign(new Error('event_id was reused with a different payload'), { status: 409 })
    }
    if (receipt.processed_at) {
      await client.query('COMMIT')
      res.json({ ok: true, duplicate: true })
      return
    }
    if (eventType !== 'msg.notify' && !eventType.includes('message')) {
      await client.query(`UPDATE wukong_webhook_receipts SET processed_at=NOW(), error=NULL WHERE event_id=$1`, [eventId])
      await client.query('COMMIT')
      res.json({ ok: true, ignored: true })
      return
    }
    if (payload.data?.suppressAgentWake === true) {
      await client.query(`UPDATE wukong_webhook_receipts SET processed_at=NOW(), error=NULL WHERE event_id=$1`, [eventId])
      await client.query('COMMIT')
      res.json({ ok: true, ignored: true, reason: 'product-state update' })
      return
    }

    const { rows: bindings } = await client.query<{
      company_id: string; profile: Record<string, unknown>; leader_agent_id: string | null
    }>(`SELECT company_id, profile, leader_agent_id FROM im_channel_bindings WHERE channel_id=$1`, [channelId])
    if (!bindings[0]) {
      throw Object.assign(new Error('WuKong channel is not bound yet; retry webhook'), { status: 503 })
    }
    const profileMembers = Array.isArray(bindings[0].profile.members) ? bindings[0].profile.members.map(String) : []
    const { rows: members } = await client.query<{ id: string; kind: 'human' | 'agent'; preset_key: string | null }>(
      `SELECT id, kind, preset_key FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
      [bindings[0].company_id, profileMembers],
    )
    if (!members.some((member) => member.id === fromUid)) {
      throw new Error('message author is not a bound channel member')
    }
    const refs = payload.refs ?? {}
    const mentionedIds = Array.isArray(payload.data?.mentionedIds) ? payload.data.mentionedIds.map(String) : []
    const recipients = resolveLearningAgentRecipients({
          authorId: fromUid,
          channelType: Number(bindings[0].profile.channelType ?? 2),
          members: members.map((member) => ({ id: member.id, kind: member.kind, presetKey: member.preset_key })),
          mentionedIds,
          mentionAll: payload.data?.mentionAll === true,
          replyAuthorId: typeof payload.data?.replyAuthorId === 'string' ? payload.data.replyAuthorId : undefined,
          leaderAgentId: bindings[0].leader_agent_id ?? undefined,
          handoffTargetId: payload.kind === 'handoff' ? refs.toAgentId : undefined,
        })
    for (const agentId of recipients) {
      const reason = payload.kind === 'handoff' ? 'handoff' : mentionedIds.includes(agentId) || payload.data?.mentionAll === true ? 'mention' : 'message'
      await client.query(
        `INSERT INTO agent_work_items
           (id, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
        [randomUUID(), bindings[0].company_id, agentId, channelId, payload.replyToClientMsgNo ?? null, clientMsgNo, reason],
      )
    }
    await client.query(`UPDATE wukong_webhook_receipts SET processed_at=NOW(), error=NULL WHERE event_id=$1`, [eventId])
    await client.query('COMMIT')
    res.json({ ok: true, recipients })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}))
