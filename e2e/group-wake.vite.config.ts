import { defineConfig, mergeConfig } from 'vite'
import config from '../vite.config'
export default mergeConfig(config, defineConfig({
  cacheDir: '/tmp/issue347/vite-cache',
  optimizeDeps: { entries: ['e2e/group-wake.html'] },
}))
