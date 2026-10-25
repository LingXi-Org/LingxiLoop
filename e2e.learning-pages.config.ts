import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-learning-pages', tests: 'e2e/learning-pages/*.e2e.ts',
  targets: [{ name: 'desktop', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN',
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
    app: { url: 'http://127.0.0.1:53470', command: { executable: process.execPath, args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/learning-pages/vite.config.ts'], log: '.e2e/learning-pages/app.log' } } }],
  workers: 1, retries: 0, timeout: 60000, assertionTimeout: 10000,
  output: '.e2e/learning-pages', reporters: ['list', 'junit', 'markdown'], trace: 'retain-on-failure',
} satisfies E2EConfig
