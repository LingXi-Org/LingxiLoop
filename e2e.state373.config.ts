import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-state373', tests: 'e2e/answer-first/state373.e2e.ts',
  targets: [{ name: 'chromium', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 900 }, locale: 'zh-CN' }),
    app: { url: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:53124' } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 15_000,
  trace: 'retain-on-failure', output: '.e2e/state373', reporters: ['list', 'junit', 'markdown'], failOnSkippedFailure: true,
} satisfies E2EConfig
