import { pool } from '../../db/pool.js'
import { openNotebookClient } from '../../knowledge/open-notebook-client.js'
import { openNotebookEnabled } from '../../knowledge/service.js'
import { ogPreview } from '../../og.js'
import { redis } from '../../redis.js'
import { storage } from '../../storage.js'
import { isWaitlistEnabled } from '../admin/facade.js'
import { PlatformApplication } from './application.js'

async function agentOsHealth(): Promise<void> {
  const baseUrl = process.env.AGENT_OS_URL?.trim()
  if (!baseUrl) throw new Error('AGENT_OS_URL is required')
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
    signal: AbortSignal.timeout(3_000),
  })
  if (!response.ok) throw new Error(`Agent OS health returned ${response.status}`)
}

export const platformApplication = new PlatformApplication({
  db: pool,
  storage,
  redisPing: async () => { await redis.ping() },
  agentOsHealth,
  openNotebookEnabled,
  openNotebookHealth: async () => {
    if (!await openNotebookClient.health()) throw new Error('Open Notebook health check failed')
  },
  loadOpenGraph: ogPreview,
  waitlistEnabled: isWaitlistEnabled,
})
