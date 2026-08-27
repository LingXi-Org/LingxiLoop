import { notifyAlert } from '../alerting.js'
import type { ServiceHandle } from './lifecycle.js'

export async function runService(name: string, start: () => Promise<ServiceHandle>): Promise<void> {
  let service: ServiceHandle
  try {
    service = await start()
  } catch (error) {
    console.error(`[${name}] fatal startup error`, error)
    process.exitCode = 1
    return
  }

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    try { await service.stop(signal) }
    catch (error) {
      console.error(`[${name}] shutdown failed`, error)
      process.exitCode = 1
    }
  }

  process.once('SIGINT', () => { void shutdown('SIGINT') })
  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
  process.on('unhandledRejection', (reason) => {
    void notifyAlert({ label: `${name}.unhandledRejection`, error: reason })
  })
  process.on('uncaughtException', (error) => {
    void notifyAlert({ label: `${name}.uncaughtException`, error })
  })
}
