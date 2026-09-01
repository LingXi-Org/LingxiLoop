import '../logging.js'
import { assertMigrationsCurrent } from '../db/migrate.js'
import { runService } from '../runtime/run-service.js'
import { startWebProcess } from '../web.js'

void runService('web', async () => {
  await assertMigrationsCurrent()
  return startWebProcess()
})
