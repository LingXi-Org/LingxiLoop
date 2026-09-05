import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { documentMentionApplication } from './mention-facade.js'

const WORKER_INTERVAL_MS = 1_000
let workerTimer: NodeJS.Timeout | null = null

export async function runDocumentMentionDeliveryOnce(
  workerId = `document-mention-${process.pid}`,
): Promise<boolean> {
  return documentMentionApplication.deliverOnce(workerId)
}

export function startDocumentMentionDeliveryWorker(): WorkerTaskHandle | null {
  if (workerTimer) return { stop: stopDocumentMentionDeliveryWorker }
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      let count = 0
      while (count < 16 && await runDocumentMentionDeliveryOnce()) count++
    } catch (error) {
      console.error('[documents] mention delivery tick failed:', error)
    } finally {
      running = false
    }
  }
  workerTimer = setInterval(() => void tick(), WORKER_INTERVAL_MS)
  workerTimer.unref?.()
  void tick()
  return { stop: stopDocumentMentionDeliveryWorker }
}

function stopDocumentMentionDeliveryWorker(): void {
  if (!workerTimer) return
  clearInterval(workerTimer)
  workerTimer = null
}
