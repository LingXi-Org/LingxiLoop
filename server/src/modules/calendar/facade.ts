import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { sendCalendarReminderEmail } from '../email/index.js'
import {
  CH_CALENDAR_EVENTS,
  CH_CALENDAR_REMINDER,
  CH_MESSAGE_NEW,
  publish,
} from '../../redis.js'
import { CalendarApplication } from './application.js'
import { CalendarScheduler } from './scheduler.js'

export { CalendarApplicationError } from './application.js'

const calendarScheduler = new CalendarScheduler({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  publishMessage: (event) => publish(CH_MESSAGE_NEW, event),
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
