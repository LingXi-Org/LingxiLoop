import { fileURLToPath } from 'node:url'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
export default defineWorkersConfig({
  css: { postcss: { plugins: [] } },
  test: {
    include: ['workers/release/src/**/*.test.ts'],
    poolOptions: { workers: { wrangler: { configPath: fileURLToPath(new URL('./wrangler.test.jsonc', import.meta.url)) }, miniflare: { bindings: {
      RELEASE_API_TOKEN: 'release-test-api-token', RELEASE_ADMIN_TOKEN: 'release-test-admin-token', EXECUTOR_TOKEN: 'executor-test-token',
    } } } },
  },
})
