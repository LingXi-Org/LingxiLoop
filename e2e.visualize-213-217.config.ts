import type { E2EConfig } from 'e2e'
import base from './e2e.visualize-loading.config'
export default { ...base, projectId: 'lingxiloop-213-217-presentation',
  tests: ['e2e/visualize/presentation-213-217.e2e.ts', 'e2e/visualize/clipboard-write.e2e.ts', 'e2e/visualize/bridge.e2e.ts'],
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-213-217',
} satisfies E2EConfig
