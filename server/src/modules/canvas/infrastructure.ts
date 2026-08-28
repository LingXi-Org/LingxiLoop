import type { CanvasEvent } from '../../redis.js'
import type { Queryable } from '../../db/queryable.js'

export interface CanvasInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  withCanvasFence<T>(canvasId: string, work: (db: Queryable) => Promise<T>): Promise<T>
  publishEvent(event: CanvasEvent): Promise<void>
}
