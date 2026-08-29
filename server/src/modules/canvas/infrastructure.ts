import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'

export interface CanvasInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  withCanvasFence<T>(canvasId: string, work: (db: Queryable) => Promise<T>): Promise<T>
  missingChannelMessageIds(input: {
    companyId: string
    actorId: string
    channelId: string
    messageIds: string[]
  }): Promise<string[]>
  publishEvent(event: CanvasEvent): Promise<void>
}
