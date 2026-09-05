/**
 * Standalone control-plane entrypoint for local development: in-memory
 * stores, an echo context provider, and a logging delivery port.
 *
 * A production deployment composes {@link ControlPlaneService} with its own
 * stores (see `pg-store.ts` and `db/schema.sql`) and product ports instead.
 */
import { loadControlPlaneConfig } from '../config.js'
import { createLogger } from '../logging.js'
import { MetricsRegistry } from '../metrics.js'
import { ControlPlaneServer } from './http-server.js'
import {
  MemoryActionLedger, MemoryEventStore, MemorySessionStore, MemoryWorkStore,
} from './memory-store.js'
import { ControlPlaneService } from './service.js'

const config = loadControlPlaneConfig()
const logger = createLogger().child({ service: 'agent-os-control-plane' })
const metrics = new MetricsRegistry()

const service = new ControlPlaneService({
  work: new MemoryWorkStore(),
  sessions: new MemorySessionStore(),
  events: new MemoryEventStore(),
  actions: new MemoryActionLedger(),
  contextProvider: {
    async loadContext(work) {
      return {
        persona: { name: 'Dev Agent', role: 'Development assistant', instructions: 'You are a helpful development agent.' },
        capabilities: [],
        messages: [{
          ref: work.triggerRef,
          authorId: work.principalId ?? 'dev-user',
          authorName: 'Developer',
          authorKind: 'human',
          body: String(work.meta?.['text'] ?? work.triggerRef),
          createdAt: new Date().toISOString(),
        }],
      }
    },
  },
  actionExecutor: {
    async execute(_work, action) {
      return { ok: false, error: `no action executor is configured for ${action.action} in the dev control plane` }
    },
  },
  capabilityResolver: {
    async resolve() { return [] },
  },
  delivery: {
    async onEvent(work, event) {
      if (event.visibility === 'user') logger.info('run event', { runId: work.id, kind: event.kind })
    },
    async deliverMessage(work, message) {
      logger.info('assistant message', { runId: work.id, body: message.body.slice(0, 500) })
    },
  },
  logger,
  metrics,
})

const server = new ControlPlaneServer({ service, serviceToken: config.serviceToken, logger, metrics })
const port = await server.listen(config.port)
logger.info('control plane listening', { port })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0))
  })
}
