import { defineConfig, mergeConfig } from 'vite'
import config from '../vite.config'
import { resolve } from 'node:path'

export default mergeConfig(config, defineConfig({
  cacheDir: 'node_modules/.vite-group-mentions',
  optimizeDeps: { entries: ['e2e/group-mentions.html'] },
  build: { outDir: 'artifacts/group-mentions/site', reportCompressedSize: false,
    rollupOptions: { input: resolve(__dirname, 'group-mentions.html') } },
  server: { watch: { ignored: ['**/.agent-os/**', '**/node_modules-native-recovery/**'] } },
}))
