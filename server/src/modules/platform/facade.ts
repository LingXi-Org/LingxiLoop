import { pool } from '../../db/pool.js'
import { ogPreview } from '../../og.js'
import { redis } from '../../redis.js'
import { storage } from '../../storage.js'
import { knowledgeEngineHealth, openNotebookEnabled } from '../knowledge/public.js'
import { probeControlReady } from './health.js'
import { PlatformApplication } from './application.js'

export const platformApplication = new PlatformApplication({
  db: pool,
  storage,
  controlReady: () => probeControlReady(process.env.LINGXIOS_CONTROL_URL?.trim() || `http://127.0.0.1:${process.env.LINGXIOS_CONTROL_PORT?.trim() || '5182'}`),
  redisPing: async () => { await redis.ping() },
  openNotebookEnabled,
  openNotebookHealth: knowledgeEngineHealth,
  loadOpenGraph: ogPreview,
})
