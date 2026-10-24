import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
const { visualizeFixtureApi } = await import('./fixture-api.ts')
const server = await createServer({ configFile: false, plugins: [visualizeFixtureApi(), react()],
  resolve: { alias: { '@': path.resolve('src') } }, cacheDir: '/tmp/loop-373-learning-vite',
  optimizeDeps: { entries: ['e2e/visualize/learning.html'] },
  server: { host: '127.0.0.1', port: 5193, strictPort: true } })
process.env.E2E_VISUALIZE_READY = '1'
await server.listen()
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); process.exit(0) })
