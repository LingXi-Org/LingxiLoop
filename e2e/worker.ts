import '../server/src/logging'
import { assertMigrationsCurrent } from '../server/src/db/migrate'
import { runService } from '../server/src/runtime/run-service'
import { productionWorkerTasks, startWorkerProcess } from '../server/src/worker'

// Exercise real ingestion and channel synchronization without a live LLM provider.
void runService('e2e-worker', async () => {
  await assertMigrationsCurrent()
  return startWorkerProcess({
    tasks: productionWorkerTasks.filter(({ name }) => [
      'learning-effects', 'im-channel-reconciliation', 'knowledge-ingestion',
    ].includes(name)),
    startAgentRuntime: async () => null,
    startAgentIngress: () => null,
  })
})
