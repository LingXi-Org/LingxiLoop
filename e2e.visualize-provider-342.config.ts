import type { E2EConfig } from 'e2e'
import base from './e2e.visualize-live.config'

export default { ...base, projectId: 'lingxiloop-342-real-provider',
  tests: 'e2e/visualize/provider-342.e2e.ts', timeout: 90000,
  output: process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-provider-342',
} satisfies E2EConfig
