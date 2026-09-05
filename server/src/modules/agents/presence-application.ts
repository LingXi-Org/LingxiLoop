import type { Queryable } from '../../db/queryable.js'
import type { ParticipantStatus } from './contracts.js'
import { resetAvailableHumanPresence, updateHumanPresence, type ParticipantStatusRow } from './repository.js'

export interface ParticipantPresenceEvent {
  type: 'participants.status'
  participantId: string
  status: Extract<ParticipantStatus, 'avail' | 'resting'>
  statusUpdatedAt: string
  companyId: string
}

export interface ParticipantPresenceInfrastructure {
  publish(event: ParticipantPresenceEvent): Promise<void>
}

function eventFor(
  row: ParticipantStatusRow,
  status: Extract<ParticipantStatus, 'avail' | 'resting'>,
): ParticipantPresenceEvent {
  return {
    type: 'participants.status',
    participantId: row.id,
    status,
    statusUpdatedAt: row.status_updated_at.toISOString(),
    companyId: row.company_id,
  }
}

export class ParticipantPresenceApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: ParticipantPresenceInfrastructure) {}

  async setHumanPresence(args: {
    companyIds: readonly string[]
    participantId: string
    status: Extract<ParticipantStatus, 'avail' | 'resting'>
  }): Promise<number> {
    const companyIds = [...new Set(args.companyIds)]
    const rows = await updateHumanPresence(this.db, companyIds, args.participantId, args.status)
    await Promise.all(rows.map((row) => this.infrastructure.publish(eventFor(row, args.status))))
    return rows.length
  }

  async resetOnBoot(): Promise<{ updated: number; publishFailures: number }> {
    const rows = await resetAvailableHumanPresence(this.db)
    const results = await Promise.allSettled(
      rows.map((row) => this.infrastructure.publish(eventFor(row, 'resting'))),
    )
    return {
      updated: rows.length,
      publishFailures: results.filter((result) => result.status === 'rejected').length,
    }
  }
}
