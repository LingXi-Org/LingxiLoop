import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'settings-removal', tests: 'browser.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1100, height: 850 },
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}),
  }), app: { url: 'http://127.0.0.1:53263/e2e/settings-removal/index.html' } }],
  workers: 1, retries: 0, timeout: 45000, assertionTimeout: 10000,
  output: '.output', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
