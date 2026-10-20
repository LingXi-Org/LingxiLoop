import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'

export default {
  ...base,
  projectId: 'lingxiloop-246-corners',
  tests: 'e2e/visualize/corners.e2e.ts',
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-corners',
} satisfies E2EConfig
