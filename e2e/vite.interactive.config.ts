import { defineConfig, mergeConfig } from 'vite'
import config from '../vite.config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default mergeConfig(config, defineConfig({
  cacheDir: 'node_modules/.vite-interactive-ui',
  optimizeDeps: { entries: ['e2e/interactive-ui.html'] },
  resolve: { dedupe: ['react', 'react-dom', '@openuidev/lang-core', '@openuidev/react-lang'] },
  build: { outDir: '.e2e/interactive-site', target: 'esnext', reportCompressedSize: false,
    rollupOptions: { input: [resolve('e2e/interactive-ui.html'), ...(existsSync('.e2e/openui-adapter-compatible/node_modules/@openuidev/assistant-ui/dist/index.mjs') ? [resolve('e2e/interactive-adapter.html')] : [])] } },
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
  preview: { host: '127.0.0.1', port: 5190, strictPort: true },
}))
