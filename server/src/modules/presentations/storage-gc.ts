import type { Queryable } from '../../db/queryable.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import type { Storage } from '../../storage.js'
import { listPresentationStorageKeys } from './repository.js'

const PRESENTATION_STORAGE_PREFIX = 'presentation-artifacts/'
const ORPHAN_SAFETY_WINDOW_MS = 24 * 60 * 60_000

export function createPresentationStorageGc(infrastructure: {
  db: Queryable
  storage: Pick<Storage, 'listObjectsByPrefix' | 'deleteObject'>
}) {
  async function runOnce(now = new Date()): Promise<{ inspected: number; deleted: number }> {
    const [objects, referencedRows] = await Promise.all([
      infrastructure.storage.listObjectsByPrefix(PRESENTATION_STORAGE_PREFIX),
      listPresentationStorageKeys(infrastructure.db),
    ])
    const referenced = new Set(referencedRows)
    let deleted = 0
    for (const object of objects) {
      if (!object.key.startsWith(PRESENTATION_STORAGE_PREFIX)
        || referenced.has(object.key)
        || now.getTime() - object.lastModifiedMs < ORPHAN_SAFETY_WINDOW_MS) continue
      if (await infrastructure.storage.deleteObject(object.key)) deleted++
    }
    return { inspected: objects.length, deleted }
  }

  function start(
    intervalMs = Number(process.env.PRESENTATION_STORAGE_GC_INTERVAL_MS ?? 24 * 60 * 60_000),
  ): WorkerTaskHandle | null {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
    const tick = () => void runOnce().catch((error) => {
      console.warn('[presentations] storage GC failed', error)
    })
    const timer = setInterval(tick, intervalMs)
    timer.unref?.()
    return { stop: () => clearInterval(timer) }
  }
  return { runOnce, start }
}
