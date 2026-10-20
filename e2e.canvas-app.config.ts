import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId: 'lingxiloop-canvas-mcp-app', tests: ['e2e/canvas-app/document.e2e.ts'],
  targets: [{ name: 'web', engine: web({ browser: 'chromium', viewport: { width: 1440, height: 960 }, locale: 'zh-CN', ...(process.env.E2E_CANVAS_CDP_URL ? { connect: { cdpEndpoint: () => process.env.E2E_CANVAS_CDP_URL! } } : {}) }), app: {
    url: 'http://127.0.0.1:5291', command: { executable: process.execPath, args: ['e2e/canvas-app/serve.mjs'], startupTimeout: 120000 },
  } }],
  workers: 1, retries: 0, timeout: 120000, assertionTimeout: 15000,
  output: 'artifacts/canvas-app/e2e', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
