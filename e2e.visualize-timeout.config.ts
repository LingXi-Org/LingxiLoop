import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'
export default { ...base, projectId: 'lingxiloop-244-timeout',
  tests: 'e2e/visualize/timeout.e2e.ts', timeout: 90000, assertionTimeout: 10000,
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-timeout',
} satisfies E2EConfig
