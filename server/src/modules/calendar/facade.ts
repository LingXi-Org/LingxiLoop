import { dispatchEvent } from '../../calendar.js'
import { pool } from '../../db/pool.js'
import { CH_CALENDAR_EVENTS, publish } from '../../redis.js'
import { CalendarApplication } from './application.js'

export { CalendarApplicationError } from './application.js'

export const calendarApplication = new CalendarApplication(
  pool,
  { publish: async (event) => publish(CH_CALENDAR_EVENTS, event) },
  { dispatch: async (event, scheduledFor) => dispatchEvent(event, scheduledFor) },
)
