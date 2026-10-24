import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'

export default { ...base, projectId: 'lingxiloop-342-authoring-delivery',
  tests: 'e2e/visualize/authoring-delivery.e2e.ts', timeout: 90000,
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-authoring',
} satisfies E2EConfig
