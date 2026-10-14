import { pool } from '../db/pool.js'
import { CH_DOCS, CH_DOC_UPDATE, CH_CONVO_UPDATED, CH_REACTIONS, CH_CANVAS, publish } from '../redis.js'
import { flushNativeEvents } from './native-events.js'
import { channelProfileForCompany } from '../im/messages-repository.js'
import { syncProductChannel } from '../agent-runtime/conversations.js'
import type { ImChannelProfile } from '../im/types.js'
import { postMembershipSystemMessage } from './membership.js'
import { clearHold } from './seen-boundary.js'
import { publishReadReceiptAdvance } from '../im/read-receipts.js'
import { sendSystemChannelMessage } from '../im/public.js'
import { createImMessagesApplication } from '../im/messages-facade.js'
import { createPermissionService } from '../modules/access/public.js'
import { withTransaction } from '../db/transaction.js'

export function startNativeEventWorker() {
  const controller = new AbortController()
  let active: Promise<void> | undefined
  const tick = () => {
    if (active || controller.signal.aborted) return
    active = flushNativeEvents(pool, async (event, signal) => {
      signal.throwIfAborted()
      switch (event.type) {
        case 'im.user': {
          await withTransaction(pool, async db => {
            // Hold the assignment and authorization until admission so cancellation cannot overtake it.
            const { rows } = await db.query(`SELECT assignment.id FROM canvas_agent_assignments assignment
              JOIN canvases canvas ON canvas.id=assignment.canvas_id JOIN users principal ON principal.id=$1
              WHERE assignment.id=$2 AND canvas.id=$3 AND canvas.company_id=$4 AND canvas.conversation_id=$5
                AND canvas.status='active' AND assignment.status<>'cancelled' AND assignment.request_client_msg_no=$6
                AND principal.departed_at IS NULL AND principal.suspended_at IS NULL AND principal.deleted_at IS NULL
                AND COALESCE(principal.access_revoked_at::text,'')=$7 FOR SHARE OF assignment,canvas,principal`,
            [event.userId,event.assignmentId,event.canvasId,event.companyId,event.channelId,event.clientNonce,event.authorization])
            if (!rows.length) return
            const permissions = createPermissionService(db, { lockDependencies: true })
            for (const [action, resource] of [['conversation:write', { type: 'conversation', id: event.channelId }],
              ['canvas:write', { type: 'canvas', id: event.canvasId }]] as const) {
              if (!(await permissions.can({ companyId: event.companyId, actorUserId: event.userId, action, resource })).allowed) return
            }
            const result = await createImMessagesApplication(signal, db).acceptUserMessage(event)
            if (result.kind !== 'accepted') throw new Error(`user assignment message ${result.kind}`)
          })
          return
        }
        case 'im.system': {
          const result = await sendSystemChannelMessage({ ...event, signal })
          if (result.kind !== 'accepted') throw new Error(`system message ${result.kind}`)
          return
        }
        case 'im.channel_sync': {
          const profile = await channelProfileForCompany(pool, event)
          if (profile) await syncProductChannel(profile as unknown as ImChannelProfile,signal)
          return
        }
        case 'im.membership': await postMembershipSystemMessage(event); return
        case 'im.clear_hold': await clearHold(event.agentId, `reply:${event.conversationId}`); return
        case 'im.read_receipt': await publishReadReceiptAdvance(event.advance); return
        case 'conversation.updated': await publish(CH_CONVO_UPDATED, event); return
        case 'message.reactions': await publish(CH_REACTIONS, event); return
        case 'canvas.changed': await publish(CH_CANVAS, event); return
        case 'doc.changed': await publish(CH_DOCS, event); return
        case 'doc.update': await publish(CH_DOC_UPDATE, event); return
      }
    }, controller.signal).catch(error => console.error('[agents] native event delivery failed', error instanceof Error ? error.name : 'error'))
      .finally(() => { active = undefined })
  }
  const timer = setInterval(tick, 1000)
  timer.unref()
  tick()
  return { async stop() {
    clearInterval(timer); controller.abort()
    if (!active) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([active,new Promise<void>(resolve => { timeout = setTimeout(resolve,5000) })])
    if (timeout) clearTimeout(timeout)
  } }
}
