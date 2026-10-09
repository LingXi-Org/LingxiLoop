import { defineConfig, mergeConfig } from 'vite'
import { resolve } from 'node:path'
import config from '../vite.config'

export default mergeConfig(config, defineConfig({
  cacheDir: 'node_modules/.vite-interactive-live',
  build: { target: 'es2022', outDir: '.e2e/interactive-live-build', rollupOptions: { input: resolve('e2e/interactive-ui-live.html') } },
  server: { host: '127.0.0.1', port: 52995, strictPort: true, proxy: { '/__ui_live': 'http://127.0.0.1:52996', '/api': 'http://127.0.0.1:52996' } },
  preview: { host: '127.0.0.1', port: 52995, strictPort: true, proxy: { '/__ui_live': 'http://127.0.0.1:52996', '/api': 'http://127.0.0.1:52996' } },
}))
