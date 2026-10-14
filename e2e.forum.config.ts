import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-forum',tests: 'e2e/forum/*.e2e.ts',
  targets: [{ name: 'forum',engine: web({ browser: 'chromium',viewport: { width: 1440,height: 1000 },locale: 'zh-CN',timezoneId: 'Asia/Shanghai' }),app: { url: 'http://127.0.0.1:53098' } }],
  workers: 1,retries: 0,timeout: 600_000,assertionTimeout: 25_000,failOnSkippedFailure: true,
  trace: 'retain-on-failure',output: 'artifacts/forum/browser',reporters: ['list','junit','markdown'],
} satisfies E2EConfig
