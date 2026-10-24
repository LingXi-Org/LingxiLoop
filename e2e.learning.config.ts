import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-373-learning', tests: ['e2e/visualize/learning.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 850 }, locale: 'zh-CN',
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
    app: { url: 'http://127.0.0.1:5193', command: { executable: process.execPath, args: ['--import', 'tsx', 'e2e/visualize/learning-serve.mjs'], startupTimeout: 120000,
      env: { ...(process.env.E2E_VISUALIZE_ASSET_ROOT ? { E2E_VISUALIZE_ASSET_ROOT: process.env.E2E_VISUALIZE_ASSET_ROOT } : {}),
        ...(process.env.E2E_VISUALIZE_RUNTIME_ROOT ? { E2E_VISUALIZE_RUNTIME_ROOT: process.env.E2E_VISUALIZE_RUNTIME_ROOT } : {}) } } } }],
  workers: 1, retries: 0, timeout: 90000, assertionTimeout: 15000,
  video: 'off', trace: 'off',
  output: '.e2e/learning', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
