import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-issue-389', tests: 'e2e/cases/draft-visibility.e2e.ts',
  targets: [{ name: 'cases', engine: web({
    browser: 'chromium', viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    connect: { cdpEndpoint: () => 'http://127.0.0.1:9339' },
  }), app: { url: 'http://127.0.0.1:53108' } }],
  workers: 1, retries: 0, timeout: 180_000, assertionTimeout: 25_000,
  failOnSkippedFailure: true, trace: 'retain-on-failure',
  output: 'artifacts/issue-389/browser', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
