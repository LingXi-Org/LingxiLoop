import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

// Requires the separately locked official cloud acceptance tools; see the
// evidence README. Production/package dependencies are unchanged.
export default {
  projectId: 'lingxiloop-answer-first-cloud', tests: ['e2e/answer-first/**/*.e2e.ts', 'e2e/web/questionnaire.e2e.ts'],
  targets: [{ name: 'reduced-motion', engine: web({ browser: 'chromium', reducedMotion: 'reduce',
    viewport: { width: 1280, height: 900 }, locale: 'zh-CN' }),
    app: { url: 'http://127.0.0.1:53124', command: { executable: process.execPath,
      args: ['e2e/answer-first/serve.mjs'], startupTimeout: 120_000 } } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 10_000,
  trace: 'retain-on-failure', output: '.e2e/answer-first-cloud', reporters: ['list', 'junit', 'markdown'], failOnSkippedFailure: true,
} satisfies E2EConfig
