import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-424-homework-validation', tests: 'e2e/homework-validation/*.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1100, height: 1400 }, locale: 'zh-CN',
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
    app: { url: 'http://127.0.0.1:5194', command: { executable: process.execPath,
      args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/homework-validation/vite.config.ts'], startupTimeout: 120_000 } } }],
  workers: 1, retries: 0, timeout: 60_000, assertionTimeout: 15_000,
  video: 'off', trace: 'retain-on-failure', output: '.e2e/homework-validation', reporters: ['list', 'junit', 'markdown'], failOnSkippedFailure: true,
} satisfies E2EConfig
