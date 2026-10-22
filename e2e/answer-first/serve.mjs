import { execFileSync } from 'node:child_process'
import { createServer } from 'vite'

// Required local guest/runtime assets are generated from the pinned sources.
execFileSync(process.execPath, ['scripts/build-visualize-runtime.mjs'], { stdio: 'inherit' })
const server = await createServer({ configFile: 'e2e/vite.answer-first.config.ts' })
await server.listen()
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); process.exit(0) })
