import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-373-settled-dark', tests: ['docs/evidence/issue-373/visual-input/settled-dark.capture.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 390, height: 900 }, locale: 'zh-CN',
    connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } }),
    app: { url: 'http://127.0.0.1:5193', command: { executable: process.execPath, args: ['node_modules/vite/bin/vite.js', '--config', 'e2e.visual-input.vite.config.ts'], env: { E2E_VISUAL_BASELINE: '0' }, startupTimeout: 90_000 } } }],
  workers: 1, retries: 0, timeout: 60_000, assertionTimeout: 15_000, video: 'off', trace: 'off',
  output: '.e2e/settled-dark-capture', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
