import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { answerFirstFixture } from './answer-first/server'
import { visualizeFixtureApi } from './visualize/fixture-api'

// Isolated synthetic fixture only: no product API proxy or environment files.
export default defineConfig({
  plugins: [react(), visualizeFixtureApi(), answerFirstFixture()],
  cacheDir: process.env.E2E_304_VITE_CACHE ?? '/tmp/lingxiloop-issue304-browser-vite-cache',
  resolve: { alias: { '@': resolve(__dirname, '../src') }, dedupe: ['@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'] },
  server: { host: '127.0.0.1', port: 53124, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
})
