import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-material-preview474',
  tests: 'e2e/material-preview474/formats.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1280, height: 900 },
    ...(process.env.E2E_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CDP_URL! } } : {}),
  }), app: { url: 'http://127.0.0.1:5194', command: {
    executable: process.execPath, args: ['node_modules/vite/bin/vite.js', '--config', 'e2e/material-preview474/vite.config.ts'],
    startupTimeout: 90_000, log: '.e2e/material-preview474-vite.log',
  } } }],
  workers: 1, retries: 0, timeout: 90_000, assertionTimeout: 20_000,
  trace: 'retain-on-failure', output: '.e2e/material-preview474', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
