import { createSlidesRuntime } from './runtime.js'
import { connectWorkspace } from './workspace-bridge.js'
const runtime = createSlidesRuntime()
connectWorkspace(runtime)
