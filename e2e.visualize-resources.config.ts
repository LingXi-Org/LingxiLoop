import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'
export default { ...base, tests: 'e2e/visualize/resources.e2e.ts',
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-resources',
  timeout: 60000, assertionTimeout: 10000,
} satisfies E2EConfig
