import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-377-loading', tests: ['e2e/visualize/performance.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 900 }, locale: 'zh-CN',
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
    app: { url: 'http://127.0.0.1:5195', command: { executable: process.execPath, args: ['--import', 'tsx', 'e2e/visualize/performance-serve.mjs'], startupTimeout: 120000,
      env: { E2E_VISUALIZE_377_BASELINE: process.env.E2E_VISUALIZE_377_BASELINE ?? '0',
        ...(process.env.E2E_VISUALIZE_377_BASELINE_REF ? { E2E_VISUALIZE_377_BASELINE_REF: process.env.E2E_VISUALIZE_377_BASELINE_REF } : {}),
        ...(process.env.E2E_VISUALIZE_ASSET_ROOT ? { E2E_VISUALIZE_ASSET_ROOT: process.env.E2E_VISUALIZE_ASSET_ROOT } : {}),
        ...(process.env.E2E_VISUALIZE_RUNTIME_ROOT ? { E2E_VISUALIZE_RUNTIME_ROOT: process.env.E2E_VISUALIZE_RUNTIME_ROOT } : {}) } } } }],
  workers: 1, retries: 0, timeout: 180000, assertionTimeout: 18000, video: 'off', trace: 'off',
  output: process.env.E2E_VISUALIZE_OUTPUT ?? (process.env.E2E_VISUALIZE_377_BASELINE === '1' ? '.e2e/377-before' : '.e2e/377-after') + (process.env.E2E_VISUALIZE_377_THREE_ONLY === '1' ? '-three' : ''), reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
