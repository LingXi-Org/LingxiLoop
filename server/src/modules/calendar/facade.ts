import { pool } from '../../db/pool.js'
import { sendSystemChannelMessage } from '../../im/public.js'
import { sendCalendarReminderEmail } from '../email/index.js'
import {
  CH_CALENDAR_EVENTS,
  CH_CALENDAR_REMINDER,
  publish,
} from '../../redis.js'
import { CalendarApplication } from './application.js'
import { CalendarScheduler } from './scheduler.js'

export { CalendarApplicationError } from './application.js'

const calendarScheduler = new CalendarScheduler({
  db: pool,
  publishDispatchMessage: async (input) => {
    const result = await sendSystemChannelMessage({
      companyId: input.companyId,
      actorId: input.actorId,
      channelId: input.channelId,
      clientNonce: input.clientNonce,
      payload: {
        version: 1,
        kind: 'system',
        clientMsgNo: input.clientNonce,
        body: input.body,
        data: { calendarEventId: input.eventId, scheduledFor: input.scheduledFor },
      },
    })
    if (result.kind !== 'accepted') throw new Error(`calendar IM dispatch failed: ${result.kind}`)
    return { messageId: result.messageId, sequence: result.sequence }
  },
  publishCalendar: (event) => publish(CH_CALENDAR_EVENTS, event),
  publishReminder: (event) => publish(CH_CALENDAR_REMINDER, event),
  sendReminderEmail: sendCalendarReminderEmail,
})

export const calendarApplication = new CalendarApplication(
  pool,
  { publish: async (event) => publish(CH_CALENDAR_EVENTS, event) },
  { dispatch: (event, scheduledFor) => calendarScheduler.dispatch(event, scheduledFor) },
)

export const startCalendarScheduler = () => calendarScheduler.start()
export const tickCalendar = (now?: Date) => calendarScheduler.tick(now)
