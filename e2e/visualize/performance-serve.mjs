import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const { visualizeFixtureApi } = await import('./fixture-api.ts')
const baseline = process.env.E2E_VISUALIZE_377_BASELINE === '1'
const baselineRef = process.env.E2E_VISUALIZE_377_BASELINE_REF
const baselineFiles = baselineRef ? [
  'src/features/chat/visualize/web/host.ts',
  'src/features/chat/visualize/web/public-resource-cache.ts',
  'src/features/chat/visualize/web/document.ts',
  'src/features/chat/visualize/web/bootstrap.ts',
  'src/features/chat/visualize/zcode/gen-ui/adapters/page.ts',
  'src/features/chat/visualize/zcode/gen-ui/adapters/retainedPage.ts',
] : ['src/features/chat/visualize/web/host.ts']
const baselineSources = new Map(baseline ? baselineFiles.map(file => [path.resolve(file),
  execFileSync('git', ['show', `${baselineRef ?? '0d1271a0cf92b22e01b456c7473f4e446027bd28'}:${file}`], { encoding: 'utf8' })]) : [])
const server = await createServer({ configFile: false,
  plugins: [{ name: 'fixed-377-host-baseline', enforce: 'pre', load(id) { return baselineSources.get(id.split('?')[0]) } }, visualizeFixtureApi(), react()],
  resolve: { alias: { '@': path.resolve('src') } }, cacheDir: '/tmp/loop-377-vite',
  optimizeDeps: { entries: ['e2e/visualize/performance.html'] },
  server: { host: '127.0.0.1', port: 5195, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } })
process.env.E2E_VISUALIZE_READY = '1'
await server.listen()
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); process.exit(0) })
