import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { NotificationPreferencesInput, NotificationScope } from './contracts.js'
import { findNotificationPreferences, listNotificationDeliveries, upsertNotificationPreferences } from './repository.js'

const DEFAULT_PREFERENCES = {
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false as const,
  timezone: 'Asia/Shanghai',
  daily_time: '19:00:00',
  weekly_day: 1,
  quiet_start: null,
  quiet_end: null,
}

export class NotificationApplication {
  constructor(private readonly db: Queryable) {}

  async preferences(scope: NotificationScope, projectId?: string) {
    return await findNotificationPreferences(this.db, scope.companyId, scope.userId, projectId) ?? {
      company_id: scope.companyId,
      user_id: scope.userId,
      project_id: projectId ?? null,
      ...DEFAULT_PREFERENCES,
    }
  }

  async setPreferences(scope: NotificationScope, input: NotificationPreferencesInput) {
    await upsertNotificationPreferences(this.db, { id: randomUUID(), ...scope, ...input })
    return this.preferences(scope, input.projectId)
  }

  deliveries(scope: NotificationScope) {
    return listNotificationDeliveries(this.db, scope.companyId, scope.userId)
  }
}
