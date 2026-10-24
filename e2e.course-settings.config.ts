import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-course-settings', tests: 'e2e/course-settings/*.e2e.ts',
  targets: [{ name: 'desktop', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 960 }, locale: 'zh-CN',
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
    app: { url: 'http://127.0.0.1:53182', command: { executable: process.execPath,
      args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/course-settings/vite.config.ts'], startupTimeout: 120_000, log: '.e2e/course-settings/app.log' } } }],
  workers: 1, retries: 0, timeout: 60_000, assertionTimeout: 5000, trace: 'retain-on-failure',
  output: '.e2e/course-settings', reporters: ['list', 'junit', 'markdown'], failOnSkippedFailure: true,
} satisfies E2EConfig
