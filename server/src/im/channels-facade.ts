import { pool } from '../db/pool.js'
import { ImChannelsApplication } from './channels-application.js'
import { wukongClient } from './wukong.js'
import { createPermissionService } from '../modules/access/public.js'
import { readChannelRunSummaries } from './channel-run-summary.js'

export const imChannelsApplication = new ImChannelsApplication({
  db: pool,
  async runSummaries(input, channelIds) {
    const permissions = createPermissionService(pool)
    try {
      return await readChannelRunSummaries(input, channelIds, {
        db: pool,
        runtime: async () => (await import('../agent-runtime/runtime.js')).lingxiOSControl(),
        can: async (conversationId, action) => (await permissions.can({ actorUserId: input.userId, companyId: input.companyId,
          action, resource: { type: 'conversation', id: conversationId } })).allowed,
      })
    } catch {
      // Optional presentation cannot block the authorized conversation list or
      // turn failed metadata reads into a guessed human action.
      return Object.fromEntries(channelIds.map(id => [id, { kind: 'unknown' as const, actor: 'unknown' as const }]))
    }
  },
  listConversations: (userId) => wukongClient().listConversations(userId),
})
