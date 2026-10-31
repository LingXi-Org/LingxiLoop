import { createSlidesRuntime } from './runtime.js'
import { connectWorkspace } from './workspace-bridge.js'
performance.mark('slides:runtime-start')
const runtime = createSlidesRuntime()
performance.mark('slides:runtime-ready')
connectWorkspace(runtime)
