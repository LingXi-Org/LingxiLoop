import type { CanvasEvent } from '../../redis.js'
import type { Queryable } from '../../db/queryable.js'

export interface CanvasConnection extends Queryable {
  release(): void
}

export interface CanvasInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  connectionTransaction<T>(connection: CanvasConnection, work: (db: Queryable) => Promise<T>): Promise<T>
  acquireConnection(): Promise<CanvasConnection>
  publishEvent(event: CanvasEvent): Promise<void>
}
