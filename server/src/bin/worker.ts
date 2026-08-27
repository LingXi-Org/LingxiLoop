import '../logging.js'
import { runService } from '../runtime/run-service.js'
import { startWorkerProcess } from '../worker.js'

void runService('worker', startWorkerProcess)
