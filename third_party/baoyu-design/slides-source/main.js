import { createSlidesRuntime } from './runtime.js'
import { filesDebugEnabled } from './modules/files-debug-core.js'
import { connectWorkspace } from './workspace-bridge.js'
performance.mark('slides:runtime-start')
const debug = filesDebugEnabled() ? await import('./modules/files-debug-panel.js').catch(() => { console.warn('Slides file debugger unavailable'); return undefined }) : undefined
const runtime = createSlidesRuntime({installFilesDebugPanel: debug?.installFilesDebugPanel})
performance.mark('slides:runtime-ready')
connectWorkspace(runtime)
