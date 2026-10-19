import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'streaming-perf-20261019', tests: ['browser.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: Number(process.env.PERF_WIDTH ?? 1440), height: process.env.PERF_WIDTH === '390' ? 844 : 960 },
    locale: 'zh-CN' }), app: { url: 'http://127.0.0.1:5320' } }],
  workers: 1, retries: 0, timeout: 90000, assertionTimeout: 30000,
  output: '.output', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
