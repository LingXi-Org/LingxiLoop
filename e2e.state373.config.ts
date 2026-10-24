import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
const cdpEndpoint = process.env.E2E_STATE373_CDP_URL
const externalUrl = process.env.E2E_BASE_URL
const staticFixture = process.env.E2E_STATE373_STATIC === '1'
export default {
  projectId: 'lingxiloop-state373', tests: 'e2e/answer-first/state373.e2e.ts',
  targets: [{ name: 'chromium', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 900 }, locale: 'zh-CN', ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}) }),
    app: { url: externalUrl ?? 'http://127.0.0.1:53124', ...(externalUrl ? {} : { command: { executable: process.execPath, args: ['node_modules/vite/bin/vite.js', ...(staticFixture ? ['preview'] : []), '--config', staticFixture ? 'e2e/vite.state373-static.config.ts' : 'e2e/vite.state373.config.ts'], startupTimeout: 90_000, log: '.e2e/state373-app.log' } }) } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 15_000,
  output: '.e2e/state373', reporters: ['list', 'junit', 'markdown'], failOnSkippedFailure: true,
} satisfies E2EConfig
