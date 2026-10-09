import { existsSync } from 'node:fs'
import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

// Test credentials are deliberately separate from developer/product credentials.
if (existsSync('.env.e2e.local')) process.loadEnvFile('.env.e2e.local')
process.env.E2E_TELEMETRY_DISABLED = '1'

const project = process.env.E2E_PROJECT ?? 'web'
if (project !== 'web' && project !== 'admin') throw new Error('E2E_PROJECT must be web or admin')
const port = project === 'web' ? 5180 : 5198
const externalUrl = process.env.E2E_BASE_URL
const cdpEndpoint = process.env.E2E_CDP_URL

export default {
  projectId: `lingxiloop-${project}`,
  tests: `e2e/${project}/**/*.e2e.ts`,
  targets: [{
    name: project,
    engine: web({
      browser: 'chromium',
      viewport: { width: 1440, height: 960 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}),
    }),
    app: {
      url: externalUrl ?? `http://127.0.0.1:${port}`,
      ...(externalUrl ? {} : {
        command: {
          executable: process.execPath,
          args: ['e2e/serve.mjs', project],
          env: { LINGXILOOP_DEV_API_TARGET: process.env.E2E_API_URL ?? 'http://127.0.0.1:8797' },
          startupTimeout: 300_000,
          log: `.e2e/${project}/app.log`,
        },
      }),
    },
  }],
  credentials: Object.fromEntries(['member', 'admin', 'student', 'manager'].map((name) => [name, {
    username: process.env[`E2E_USER_${name.toUpperCase()}_USERNAME`] ?? '',
    password: () => process.env[`E2E_USER_${name.toUpperCase()}_PASSWORD`] ?? '',
  }])),
  workers: 1,
  retries: 0,
  timeout: 90_000,
  assertionTimeout: 15_000,
  failOnSkippedFailure: true,
  trace: 'retain-on-failure',
  output: `.e2e/${project}`,
  reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
