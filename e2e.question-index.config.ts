import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

const cdpEndpoint = process.env.E2E_CDP_URL
const baseUrl = process.env.E2E_BASE_URL
export default {
  projectId: 'lingxiloop-question-index',
  tests: 'e2e/question-index/*.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
    ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}) }),
    app: baseUrl ? { url: baseUrl } : { url: 'http://127.0.0.1:5189', command: { executable: process.execPath, args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], startupTimeout: 120_000 } } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 15_000,
  output: 'artifacts/question-index/browser', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
