import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'journeys-perf-20261019', tests: ['journeys.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN' }),
    app: { url: 'http://127.0.0.1:5180' } }],
  workers: 1, retries: 0, timeout: 90000, assertionTimeout: 30000,
  output: '.journeys-output', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
