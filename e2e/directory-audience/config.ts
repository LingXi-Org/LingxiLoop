import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-directory-audience', tests: 'browser.e2e.ts',
  targets: [{ name: 'directory-audience', engine: web({ browser: 'chromium', viewport: { width: 1100, height: 1000 },
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}) }),
  app: { url: 'http://127.0.0.1:53158' } }],
  workers: 1, retries: 0, timeout: 180000, assertionTimeout: 15000, failOnSkippedFailure: true,
  trace: 'retain-on-failure', output: '.output', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
