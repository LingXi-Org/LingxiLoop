import type { E2EConfig } from 'e2e'
import loading from './e2e.visualize-loading.config'
export default { ...loading, tests: 'e2e/visualize/startup.e2e.ts',
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-startup',
} satisfies E2EConfig
