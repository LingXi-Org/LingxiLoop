import { defineConfig, mergeConfig } from 'vite'
import { resolve } from 'node:path'
import config from '../../vite.config'
export default mergeConfig(config, defineConfig({
  build: { outDir: '.e2e/streaming-perf-site', reportCompressedSize: false,
    rollupOptions: { input: resolve('perf/streaming-20261019/browser.html') } },
  preview: { host: '127.0.0.1', port: 5320, strictPort: true, proxy: { '/perf-api': 'http://127.0.0.1:5321' } },
}))
