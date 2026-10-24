import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { answerFirstFixture } from './answer-first/server'

// Only two synthetic entrypoints; no proxy, environment files or generated-asset build.
export default defineConfig({
  envDir: resolve(__dirname, 'state373-empty-env'),
  plugins: [react(), answerFirstFixture()],
  cacheDir: '/tmp/loop-state373-vite-cache',
  resolve: { alias: { '@': resolve(__dirname, '../src') }, dedupe: ['@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'] },
  optimizeDeps: { entries: ['e2e/answer-first.html', 'e2e/questionnaire.html'] },
  server: { host: '127.0.0.1', port: 53124, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
})
