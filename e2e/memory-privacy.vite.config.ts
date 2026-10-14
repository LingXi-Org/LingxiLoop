import { defineConfig, mergeConfig } from 'vite'
import { resolve } from 'node:path'
import config from '../vite.config'

export default mergeConfig(config, defineConfig({
  cacheDir: 'node_modules/.vite-memory-privacy',
  optimizeDeps: { entries: ['e2e/memory-privacy.html'] },
  build: { outDir: 'artifacts/memory/site',reportCompressedSize: false,
    rollupOptions: { input: resolve(__dirname,'memory-privacy.html') } },
  server: { watch: { ignored: ['**/.agent-os/**', '**/node_modules-native-recovery/**', '**/artifacts/**'] } },
}))
