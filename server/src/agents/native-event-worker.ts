import { pool } from '../db/pool.js'
import { CH_CALENDAR_EVENTS, CH_DOCS, CH_DOC_UPDATE, CH_CONVO_UPDATED, CH_REACTIONS, CH_CANVAS, publish } from '../redis.js'
import { flushNativeEvents } from './native-events.js'
import { channelProfileForCompany } from '../im/messages-repository.js'
import { syncProductChannel } from '../agent-runtime/conversations.js'
import type { ImChannelProfile } from '../im/types.js'
import { postMembershipSystemMessage } from './membership.js'
import { clearHold } from './seen-boundary.js'
import { publishReadReceiptAdvance } from '../im/read-receipts.js'
import { sendSystemChannelMessage } from '../im/public.js'

export function startNativeEventWorker() {
  const controller = new AbortController()
  let active: Promise<void> | undefined
  const tick = () => {
    if (active || controller.signal.aborted) return
    active = flushNativeEvents(pool, async (event, signal) => {
      signal.throwIfAborted()
      switch (event.type) {
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
        case 'calendar.changed': await publish(CH_CALENDAR_EVENTS, event); return
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
