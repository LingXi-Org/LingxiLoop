import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
import { resolve } from 'node:path'

const cdpEndpoint = process.env.E2E_CDP_URL
const root = resolve(import.meta.dirname, '../..')
export default {
  projectId: 'lingxiloop-issue-408', tests: 'browser.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 960 }, locale: 'zh-CN',
    ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}) }),
  app: { url: 'http://127.0.0.1:53128', command: { executable: process.execPath,
    args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/issue-408/vite.config.ts'], cwd: root, startupTimeout: 120_000 } } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 30_000,
  output: '.e2e/browser', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
