// Separate synthetic model worker for connection-recovery-server.mjs. The
// parent supplies only its fixed disposable environment and local control URL.
import '../server/src/__integration__/_helpers.ts'
import { startLingxiOSWorker } from '../server/src/agent-runtime/runtime.ts'
import { closeDatabasePools } from '../server/src/db/pool.ts'

const worker = await startLingxiOSWorker()
const stop = async () => {
  await worker.stop()
  await closeDatabasePools()
  process.exit(0)
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
