import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-retire-layout', tests: 'e2e/visual/retire-layout.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' }),
    app: { url: 'http://127.0.0.1:5207', command: { executable: process.execPath,
      args: ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.ui-experience.config.ts', '--port', '5207'], startupTimeout: 300_000 } } }],
  workers: 1, retries: 0, timeout: 120_000, assertionTimeout: 30_000,
  output: process.env.E2E_LAYOUT_PHASE === 'before' ? 'artifacts/retire-layout/before' : 'artifacts/retire-layout/after', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
