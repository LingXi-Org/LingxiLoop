import '../logging.js'
import { runService } from '../runtime/run-service.js'
import { startWebProcess } from '../web.js'

void runService('web', startWebProcess)
