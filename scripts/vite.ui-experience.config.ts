import { defineConfig, mergeConfig } from 'vite'
import config from '../vite.config'

// Keep the check page's optimizer separate from concurrently running app previews.
export default mergeConfig(config, defineConfig({
  cacheDir: 'node_modules/.vite-ui-experience',
  optimizeDeps: { entries: ['scripts/ui-experience-browser-check.html'] },
  build: { minify: false, reportCompressedSize: false, outDir: 'artifacts/ui-experience/site',
    rollupOptions: { input: 'scripts/ui-experience-browser-check.html' },
  },
  server: { host: '127.0.0.1', port: 5187, strictPort: true,
    watch: { ignored: ['**/node_modules-native-recovery/**', '**/.agent-os/**'] },
  },
}))
