import { createHash, randomUUID } from 'node:crypto'
import type { ActionContext } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import type { CalendarChangedEvent } from '../modules/calendar/contracts.js'
import type { DocumentChangedEvent, DocumentUpdateEvent } from '../modules/documents/contracts.js'
import type { ConversationUpdatedEvent } from '../modules/conversations/contracts.js'
import type { ReactionChangedEvent } from '../modules/messages/contracts.js'
import type { ReadReceiptAdvance } from '../im/read-receipts-contracts.js'
import type { LingxiMessageV1 } from '../im/message-types.js'
import type { CanvasEvent } from '../redis.js'

export type NativeEvent = CalendarChangedEvent | DocumentChangedEvent | DocumentUpdateEvent | ConversationUpdatedEvent | ReactionChangedEvent | CanvasEvent
  | { type: 'im.channel_sync'; companyId: string; channelId: string }
  | { type: 'im.membership'; companyId: string; conversationId: string; actorId: string; participantId: string; kind: 'joined' | 'left'; clientNonce: string }
  | { type: 'im.clear_hold'; agentId: string; conversationId: string }
  | { type: 'im.read_receipt'; advance: ReadReceiptAdvance }
  | { type: 'im.system'; companyId: string; actorId: string; channelId: string; clientNonce: string; payload: LingxiMessageV1 }

export async function queueNativeEvents(context: ActionContext, events: NativeEvent[]): Promise<void> {
  for (const event of events) await context.database.query(`INSERT INTO agent_native_event_outbox(id,company_id,work_id,event)
    VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`, [
    `${context.action.idempotencyKey}:${createHash('sha256').update(JSON.stringify(event)).digest('hex')}`,
    context.work.tenantId, context.work.id, JSON.stringify(event),
  ])
}

/** Product events are delivered after their native mutation and action receipt commit. */
export async function flushNativeEvents(db: Queryable, publish: (event: NativeEvent, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal): Promise<void> {
  await db.query(`UPDATE agent_native_event_outbox SET failed_at=NOW(),claim_token=NULL,
    last_error=COALESCE(last_error,'delivery lease expired after retry limit')
    WHERE delivered_at IS NULL AND failed_at IS NULL AND attempts>=12 AND available_at<=NOW()`)
  for (let count = 0; count < 16 && !signal.aborted; count++) {
    const token = randomUUID()
    const { rows } = await db.query<{ id: string; event: NativeEvent; attempts: number }>(`WITH next AS (
      SELECT id FROM agent_native_event_outbox WHERE delivered_at IS NULL AND failed_at IS NULL AND attempts<12
        AND available_at<=NOW() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)
      UPDATE agent_native_event_outbox o SET claim_token=$1,available_at=NOW()+INTERVAL '30 seconds',attempts=attempts+1
      FROM next WHERE o.id=next.id RETURNING o.id,o.event,o.attempts`, [token])
    const row = rows[0]
    if (!row) return
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    let abort: (() => void) | undefined
    try {
      await Promise.race([publish(row.event, deadline), new Promise<never>((_resolve, reject) => {
        abort = () => reject(deadline.reason)
        if (deadline.aborted) abort(); else deadline.addEventListener('abort', abort, { once: true })
      })])
      await db.query('UPDATE agent_native_event_outbox SET delivered_at=NOW(),claim_token=NULL,last_error=NULL WHERE id=$1 AND claim_token=$2', [row.id,token])
    } catch (error) {
      await db.query(`UPDATE agent_native_event_outbox SET claim_token=NULL,last_error=$3,
        failed_at=CASE WHEN attempts>=12 THEN NOW() ELSE NULL END,
        available_at=NOW()+($4*INTERVAL '1 second') WHERE id=$1 AND claim_token=$2`,
      [row.id,token,error instanceof Error ? error.name.slice(0,100) : 'NativeDeliveryError',Math.min(300,2 ** row.attempts)])
    } finally { if (abort) deadline.removeEventListener('abort', abort) }
  }
}
