import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./', import.meta.url))
const cdpEndpoint = process.env.E2E_VISUAL_CDP_URL
export default {
  projectId: 'lingxiloop-workbench-visual',
  tests: 'e2e/visual/*.e2e.ts',
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {}) }), app: {
    url: 'http://127.0.0.1:5187',
    command: { executable: process.execPath, args: ['e2e/visual/serve.mjs'], cwd: root, startupTimeout: 300_000 },
  } }],
  workers: 1, retries: 0, timeout: 180_000, assertionTimeout: 30_000,
  output: 'artifacts/ui-redesign/visual', reporters: ['list', 'markdown', 'junit'],
} satisfies E2EConfig
