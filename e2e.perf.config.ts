import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-performance',
  tests: process.env.PERF_GUARDS === '1' ? ['e2e/web/auth.e2e.ts', 'perf/bench/guards.e2e.ts'] : 'perf/bench/measure.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', connect: { cdpEndpoint: () => 'http://127.0.0.1:9239' } }), app: { url: process.env.PERF_BASE_URL ?? (process.env.PERF_GUARDS === '1' ? 'http://127.0.0.1:5198' : 'http://127.0.0.1:5180'), environment: 'test' } }],
  workers: 1, retries: 0, timeout: 120_000, assertionTimeout: 45_000,
  output: '.e2e/perf-run', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
