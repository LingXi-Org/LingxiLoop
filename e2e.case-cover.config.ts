import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

const cdpEndpoint = process.env.E2E_CASE_COVER_CDP_URL
export default {
  projectId: 'lingxiloop-case-cover-boundary', tests: 'e2e/case-cover/*.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1000, height: 720 }, locale: 'zh-CN', ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}) }), app: {
    url: 'http://127.0.0.1:5189', command: { executable: process.execPath,
      args: ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.case-cover.config.ts'], startupTimeout: 30_000, log: '.e2e/case-cover-app.log' },
  } }],
  workers: 1, retries: 0, timeout: 45_000, assertionTimeout: 10_000,
  output: '.e2e/case-cover', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
