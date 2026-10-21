import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Isolated synthetic component/transport fixture; never uses a product API proxy.
export default defineConfig({
  plugins: [react()],
  cacheDir: process.env.LINGXILOOP_VITE_CACHE_DIR ?? '/tmp/lingxiloop-issue275-vite-cache',
  resolve: { alias: { '@': resolve(__dirname,'../src') },dedupe: ['@assistant-ui/react','@assistant-ui/core','@assistant-ui/store','@assistant-ui/tap'] },
  optimizeDeps: { entries: ['e2e/native-streaming.html'] },
  server: { host: '127.0.0.1',port: 5197,strictPort: true,watch: { ignored: ['**/third_party/**','**/node_modules/**'] } },
})
