import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-visual-input', tests: 'e2e/web/visual-input.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1100, height: 900 }, locale: 'zh-CN',
    connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } }),
    app: { url: 'http://127.0.0.1:5193', command: { executable: process.execPath, args: ['node_modules/vite/bin/vite.js', '--config', 'e2e.visual-input.vite.config.ts'], env: { E2E_VISUAL_BASELINE: process.env.E2E_VISUAL_BASELINE ?? '0' }, startupTimeout: 90_000, log: '.e2e/visual-input-vite.log' } } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 15_000, output: process.env.E2E_VISUAL_BASELINE === '1' ? '.e2e/visual-input-before' : '.e2e/visual-input-after',
  trace: 'off', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
