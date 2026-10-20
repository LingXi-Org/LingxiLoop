import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-forum',tests: process.env.FORUM_CORE==='1'?'e2e/forum/browser.e2e.ts':process.env.FORUM_ISSUE219==='1'?'e2e/forum/issue219.e2e.ts':process.env.FORUM_ISSUE187==='1'?'e2e/forum/resources.e2e.ts':process.env.FORUM_ISSUE184==='1'?'e2e/forum/issue184.e2e.ts':process.env.FORUM_ISSUE163==='1'?'e2e/forum/issue163.e2e.ts':process.env.FORUM_ISSUE146==='1'?'e2e/forum/issue146.e2e.ts':['e2e/forum/browser.e2e.ts','e2e/forum/composer.e2e.ts','e2e/forum/retirement.e2e.ts','e2e/forum/issue146.e2e.ts','e2e/forum/issue163.e2e.ts','e2e/forum/issue184.e2e.ts','e2e/forum/resources.e2e.ts'],
  targets: [{ name: 'forum',engine: web({ browser: 'chromium',viewport: { width: 1440,height: 1000 },locale: 'zh-CN',timezoneId: 'Asia/Shanghai' }),app: { url: 'http://127.0.0.1:53098' } }],
  workers: 1,retries: 0,timeout: 600_000,assertionTimeout: 25_000,failOnSkippedFailure: true,
  trace: 'retain-on-failure',output: process.env.FORUM_CORE==='1'?'artifacts/forum/core/browser':process.env.FORUM_ISSUE219==='1'?'artifacts/forum/issue219/browser':process.env.FORUM_ISSUE187==='1'?'artifacts/issue-187/forum/browser':process.env.FORUM_ISSUE184==='1'?'artifacts/forum/issue184/browser':process.env.FORUM_ISSUE163==='1'?'artifacts/forum/issue163/browser':process.env.FORUM_ISSUE146==='1'?'artifacts/forum/issue146/browser':'artifacts/forum/browser',reporters: ['list','junit','markdown'],
} satisfies E2EConfig
