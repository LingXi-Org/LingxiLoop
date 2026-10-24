import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const { visualizeFixtureApi } = await import('./fixture-api.ts')
const baseline = process.env.E2E_VISUALIZE_377_BASELINE === '1'
const hostPath = path.resolve('src/features/chat/visualize/web/host.ts')
const baselineSource = baseline ? execFileSync('git', ['show', '0d1271a0cf92b22e01b456c7473f4e446027bd28:src/features/chat/visualize/web/host.ts'], { encoding: 'utf8' }) : null
const server = await createServer({ configFile: false,
  plugins: [{ name: 'fixed-377-host-baseline', enforce: 'pre', load(id) { if (baselineSource && id.split('?')[0] === hostPath) return baselineSource } }, visualizeFixtureApi(), react()],
  resolve: { alias: { '@': path.resolve('src') } }, cacheDir: '/tmp/loop-377-vite',
  optimizeDeps: { entries: ['e2e/visualize/performance.html'] },
  server: { host: '127.0.0.1', port: 5195, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } })
process.env.E2E_VISUALIZE_READY = '1'
await server.listen()
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); process.exit(0) })
