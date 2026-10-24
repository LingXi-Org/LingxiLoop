import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-379', tests: ['e2e/favicon-pinned/*.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 900, height: 900 }, locale: 'zh-CN',
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
    app: { url: 'http://127.0.0.1:5196', command: { executable: process.execPath, args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/favicon-pinned/vite.config.ts'], startupTimeout: 90_000 } } }],
  workers: 1, retries: 0, timeout: 60_000, assertionTimeout: 15_000, video: 'off', trace: 'off',
  output: '.e2e/favicon-pinned-browser', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
