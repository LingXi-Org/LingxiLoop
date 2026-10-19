import { defineConfig, mergeConfig } from 'vite'
import { resolve } from 'node:path'
import config from '../vite.config'

export default mergeConfig(config, defineConfig({
  build: { outDir: '.e2e/questionnaire-site', reportCompressedSize: false,
    rollupOptions: { input: resolve('e2e/questionnaire.html') } },
  preview: { host: '127.0.0.1', port: 5194, strictPort: true },
}))
