import '../logging.js'
import { assertMigrationsCurrent } from '../db/migrate.js'
import { runService } from '../runtime/run-service.js'
import { startWorkerProcess } from '../worker.js'

void runService('worker', async () => {
  await assertMigrationsCurrent()
  return startWorkerProcess()
})
