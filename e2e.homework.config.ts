import { existsSync } from 'node:fs'
import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

if (existsSync('.env.e2e.local')) process.loadEnvFile('.env.e2e.local')
export default {
  projectId: 'lingxiloop-homework', tests: 'e2e/homework/browser.e2e.ts',
  targets: [{ name: 'homework', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' }),
    app: { url: 'http://127.0.0.1:53198' } }],
  credentials: Object.fromEntries(['member', 'student'].map(name => [name, {
    username: process.env[`E2E_USER_${name.toUpperCase()}_USERNAME`] || `${name}@e2e.lingxiloop.test`,
    password: () => process.env[`E2E_USER_${name.toUpperCase()}_PASSWORD`] || 'Local-E2E-password-0001!',
  }])),
  workers: 1, retries: 0, timeout: 1_500_000, assertionTimeout: 30_000, failOnSkippedFailure: true,
  trace: 'retain-on-failure', output: `${process.env.HOMEWORK_ARTIFACT_DIR ?? 'artifacts/homework/incomplete'}/browser`, reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
