import type { Queryable } from '../../db/queryable.js'
import type { NotificationPreferencesInput, NotificationPreferencesRow } from './contracts.js'

export async function findNotificationPreferences(
  db: Queryable,
  companyId: string,
  userId: string,
  projectId?: string,
): Promise<NotificationPreferencesRow | null> {
  const { rows } = await db.query<NotificationPreferencesRow>(
    `SELECT company_id,user_id,project_id,in_app_enabled,email_enabled,push_enabled,timezone,
            daily_time::text,weekly_day,quiet_start::text,quiet_end::text
       FROM notification_preferences
      WHERE company_id=$1 AND user_id=$2
        AND (project_id IS NOT DISTINCT FROM $3 OR ($3::text IS NOT NULL AND project_id IS NULL))
      ORDER BY project_id NULLS LAST LIMIT 1`,
    [companyId, userId, projectId ?? null],
  )
  return rows[0] ?? null
}

export async function upsertNotificationPreferences(
  db: Queryable,
  args: NotificationPreferencesInput & { id: string; companyId: string; userId: string },
): Promise<void> {
  if (!args.projectId) {
    await db.query(
      `INSERT INTO notification_preferences
         (id,company_id,user_id,project_id,in_app_enabled,email_enabled,push_enabled,timezone,
          daily_time,weekly_day,quiet_start,quiet_end)
       VALUES($1,$2,$3,NULL,$4,$5,FALSE,$6,$7,$8,$9,$10)
       ON CONFLICT(company_id,user_id) WHERE project_id IS NULL DO UPDATE SET
         in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,
         timezone=EXCLUDED.timezone,daily_time=EXCLUDED.daily_time,weekly_day=EXCLUDED.weekly_day,
         quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=NOW()`,
      [args.id, args.companyId, args.userId, args.inAppEnabled, args.emailEnabled,
        args.timezone, args.dailyTime, args.weeklyDay, args.quietStart, args.quietEnd],
    )
    return
  }
  await db.query(
    `INSERT INTO notification_preferences
       (id,company_id,user_id,project_id,in_app_enabled,email_enabled,push_enabled,timezone,
        daily_time,weekly_day,quiet_start,quiet_end)
     VALUES($1,$2,$3,$4,$5,$6,FALSE,$7,$8,$9,$10,$11)
     ON CONFLICT(company_id,user_id,project_id) WHERE project_id IS NOT NULL DO UPDATE SET
       in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,
       timezone=EXCLUDED.timezone,daily_time=EXCLUDED.daily_time,weekly_day=EXCLUDED.weekly_day,
       quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=NOW()`,
    [args.id, args.companyId, args.userId, args.projectId, args.inAppEnabled, args.emailEnabled,
      args.timezone, args.dailyTime, args.weeklyDay, args.quietStart, args.quietEnd],
  )
}

export async function listNotificationDeliveries(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT id,project_id,channel,policy,summary,link_path,status,sent_at,created_at
       FROM notification_deliveries
      WHERE company_id=$1 AND recipient_user_id=$2 AND channel='IN_APP'
      ORDER BY created_at DESC LIMIT 100`,
    [companyId, userId],
  )
  return rows
}
