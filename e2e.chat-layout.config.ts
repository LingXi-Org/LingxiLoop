import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

const baseUrl = process.env.E2E_BASE_URL
const cdpEndpoint = process.env.E2E_CDP_URL
export default {
  projectId: 'lingxiloop-chat-layout-445-446', tests: 'e2e/chat-layout/*.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
    ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}) }),
    app: baseUrl ? { url: baseUrl } : { url: 'http://127.0.0.1:5197', command: { executable: process.execPath,
      args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/chat-layout/vite.config.ts'], startupTimeout: 120_000 } } }],
  workers: 1, retries: 0, timeout: 120_000, assertionTimeout: 15_000,
  output: '.e2e/chat-layout-browser', reporters: ['list', 'junit', 'markdown'], video: 'off', trace: 'off',
} satisfies E2EConfig
