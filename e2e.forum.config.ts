import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-forum',tests: process.env.FORUM_ISSUE146==='1'?'e2e/forum/issue146.e2e.ts':'e2e/forum/*.e2e.ts',
  targets: [{ name: 'forum',engine: web({ browser: 'chromium',viewport: { width: 1440,height: 1000 },locale: 'zh-CN',timezoneId: 'Asia/Shanghai' }),app: { url: 'http://127.0.0.1:53098' } }],
  workers: 1,retries: 0,timeout: 600_000,assertionTimeout: 25_000,failOnSkippedFailure: true,
  trace: 'retain-on-failure',output: process.env.FORUM_ISSUE146==='1'?'artifacts/forum/issue146/browser':'artifacts/forum/browser',reporters: ['list','junit','markdown'],
} satisfies E2EConfig
