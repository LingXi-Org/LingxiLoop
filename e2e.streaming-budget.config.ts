import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-streaming-budget', tests: 'e2e/web/streaming-budget.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1100, height: 900 }, locale: 'zh-CN',
    connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } }),
    app: { url: 'http://127.0.0.1:5196', command: { executable: process.execPath,
      args: ['node_modules/vite/bin/vite.js', 'preview', '--config', 'e2e.streaming-budget.vite.config.ts'],
      startupTimeout: 30_000, log: '.e2e/streaming-budget-preview.log' } } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 15_000,
  output: '.e2e/streaming-budget-browser', trace: 'off', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
