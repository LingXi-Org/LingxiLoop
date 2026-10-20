import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-official-reference-isolated',
  tests: '*.e2e.ts',
  targets: [{ name: 'official', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' }), app: { url: 'https://www.assistant-ui.com' } }],
  workers: 1, retries: 0, timeout: 90000, assertionTimeout: 15000,
  trace: 'retain-on-failure', output: 'result', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
