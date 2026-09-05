import { pool } from '../../db/pool.js'
import { agentOSNodeTimeoutSeconds } from '../../agent-os/node-liveness.js'
import { ogPreview } from '../../og.js'
import { redis } from '../../redis.js'
import { storage } from '../../storage.js'
import { knowledgeEngineHealth, openNotebookEnabled } from '../knowledge/public.js'
import { PlatformApplication } from './application.js'

async function agentOsHealth(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM agent_os_workers
      WHERE last_seen_at > NOW()-make_interval(secs => $1::int) LIMIT 1`,
    [agentOSNodeTimeoutSeconds()],
  )
  if (!rows[0]) throw new Error('no live Agent OS workers')
}

export const platformApplication = new PlatformApplication({
  db: pool,
  storage,
  redisPing: async () => { await redis.ping() },
  agentOsHealth,
  openNotebookEnabled,
  openNotebookHealth: knowledgeEngineHealth,
  loadOpenGraph: ogPreview,
})
