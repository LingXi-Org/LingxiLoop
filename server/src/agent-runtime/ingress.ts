import { randomUUID } from 'node:crypto'
import type { LingxiMessageV1 } from '../im/message-types.js'
import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { receiveAgentRequest } from './receive.js'
import { agentContinuationSchema, attachmentMessageIdsSchema } from '../im/contracts.js'

export interface AgentWakeInput {
  eventId: string
  companyId: string
  channelId: string
  clientMsgNo: string
  payload: LingxiMessageV1
  recipients: string[]
  knowledgeSourceId?: string
}

export async function enqueueAgentWakes(db: Queryable, input: AgentWakeInput): Promise<number> {
  if (input.payload.data?.suppressAgentWake === true) return 0
  let kind: 'message' | 'handoff' | 'calendar'
  let recipients = input.recipients
  let attachments = attachmentMessageIdsSchema.parse(input.payload.data?.attachmentClientMsgNos ?? [])
  if (input.payload.kind === 'text') {
    kind = 'message'
    if (input.payload.data?.agentContinuation !== undefined) {
      const continuation = agentContinuationSchema.parse(input.payload.data.agentContinuation)
      recipients = recipients.filter(id => id === continuation.agentId)
    }
  }
  else if (input.payload.kind === 'handoff') kind = 'handoff'
  else if (input.payload.kind === 'attachment') {
    kind = 'message'
    attachments = attachmentMessageIdsSchema.parse([...new Set([...attachments, input.clientMsgNo])])
  } else if (input.payload.kind === 'system'
    && typeof input.payload.data?.calendarEventId === 'string'
    && typeof input.payload.data?.scheduledFor === 'string') {
    kind = 'calendar'
    const { rows } = await db.query<{ assignee_id: string }>(
      `SELECT assignee_id FROM calendar_events
        WHERE company_id=$1 AND id=$2 AND kind='agent_task' AND target_conversation_id=$3
          AND assignee_id IS NOT NULL`,
      [input.companyId, input.payload.data.calendarEventId, input.channelId],
    )
    recipients = rows[0] ? [rows[0].assignee_id] : []
  } else return 0

  let inserted = 0
  for (const agentId of new Set(recipients)) {
    const { rowCount } = await db.query(
      `INSERT INTO lingxios_ingress_outbox
        (event_id,agent_id,company_id,channel_id,client_msg_no,kind,attachment_client_msg_nos,knowledge_source_id,available_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9 THEN NOW() ELSE NULL END)
       ON CONFLICT(event_id,agent_id) DO UPDATE SET event_id=EXCLUDED.event_id
       WHERE lingxios_ingress_outbox.company_id=EXCLUDED.company_id
         AND lingxios_ingress_outbox.channel_id=EXCLUDED.channel_id
         AND lingxios_ingress_outbox.client_msg_no=EXCLUDED.client_msg_no
         AND lingxios_ingress_outbox.kind=EXCLUDED.kind
         AND lingxios_ingress_outbox.attachment_client_msg_nos=EXCLUDED.attachment_client_msg_nos
         AND lingxios_ingress_outbox.knowledge_source_id IS NOT DISTINCT FROM EXCLUDED.knowledge_source_id
       RETURNING event_id`,
      [input.eventId, agentId, input.companyId, input.channelId, input.clientMsgNo, kind, attachments,
        input.knowledgeSourceId ?? null, true],
    )
    if (rowCount !== 1) throw new Error('WuKong event identity was reused with a different Agent wake')
    inserted++
  }
  return inserted
}

export async function flushAgentWakes(eventId?: string, signal?: AbortSignal): Promise<number> {
  let delivered = 0
  await pool.query(`UPDATE lingxios_ingress_outbox SET failed_at=NOW(),claim_token=NULL,claimed_until=NULL,
    error=COALESCE(error,'ingress lease expired after retry limit') WHERE delivered_at IS NULL AND failed_at IS NULL
      AND attempts>=12 AND (claimed_until IS NULL OR claimed_until<NOW())`)
  for (let count = 0; count < 8 && !signal?.aborted; count++) {
    const token = randomUUID()
    const { rows } = await pool.query<{
      event_id: string; agent_id: string; company_id: string; channel_id: string; client_msg_no: string
      kind: 'message' | 'handoff' | 'calendar'; attachment_client_msg_nos: string[]
    }>(
      `WITH candidate AS (
         SELECT event_id,agent_id FROM lingxios_ingress_outbox
          WHERE delivered_at IS NULL AND failed_at IS NULL AND attempts<12 AND available_at<=NOW()
            AND (claimed_until IS NULL OR claimed_until<NOW())
            AND ($1::text IS NULL OR event_id=$1)
          ORDER BY available_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       UPDATE lingxios_ingress_outbox wake SET claim_token=$2,claimed_until=NOW()+INTERVAL '60 seconds',
         attempts=attempts+1
       FROM candidate WHERE wake.event_id=candidate.event_id AND wake.agent_id=candidate.agent_id
       RETURNING wake.event_id,wake.agent_id,wake.company_id,wake.channel_id,wake.client_msg_no,wake.kind,
         wake.attachment_client_msg_nos`,
      [eventId ?? null, token],
    )
    const wake = rows[0]
    if (!wake) return delivered
    const deadline = AbortSignal.any([AbortSignal.timeout(30_000),...signal ? [signal] : []])
    let abort: (() => void) | undefined
    try {
      const input = { companyId: wake.company_id, agentId: wake.agent_id, channelId: wake.channel_id,
        clientMsgNo: wake.client_msg_no }
      await Promise.race([receiveAgentRequest({ ...input, kind: wake.kind, attachmentClientMsgNos: wake.attachment_client_msg_nos, signal: deadline }),
        new Promise<never>((_resolve,reject) => {
          abort = () => reject(deadline.reason)
          if (deadline.aborted) abort(); else deadline.addEventListener('abort',abort,{ once: true })
        })])
      await pool.query(
        `UPDATE lingxios_ingress_outbox SET delivered_at=NOW(),claim_token=NULL,claimed_until=NULL,error=NULL
          WHERE event_id=$1 AND agent_id=$2 AND claim_token=$3`,
        [wake.event_id, wake.agent_id, token],
      )
      delivered++
    } catch (error) {
      await pool.query(
        `UPDATE lingxios_ingress_outbox SET claim_token=NULL,claimed_until=NULL,
          failed_at=CASE WHEN attempts>=12 THEN NOW() ELSE NULL END,
          available_at=NOW()+LEAST(300,5*power(2,LEAST(attempts-1,6)))*INTERVAL '1 second',error=$4
          WHERE event_id=$1 AND agent_id=$2 AND claim_token=$3`,
        [wake.event_id, wake.agent_id, token, (error instanceof Error ? error.message : String(error)).slice(0, 2000)],
      )
      if (eventId) throw error
    } finally { if (abort) deadline.removeEventListener('abort',abort) }
  }
  return delivered
}

export function startAgentIngressRetry(intervalMs = 1_000) {
  const controller = new AbortController()
  let running = false
  const timer = setInterval(() => {
    if (running || controller.signal.aborted) return
    running = true
    void flushAgentWakes(undefined,controller.signal).catch(error => console.error('[lingxios] ingress retry failed', error instanceof Error ? error.name : 'error'))
      .finally(() => { running = false })
  }, intervalMs)
  timer.unref?.()
  return { stop: () => { clearInterval(timer); controller.abort() } }
}
