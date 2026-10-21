import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'

export default {
  ...base,
  projectId: 'lingxiloop-264-window',
  tests: 'e2e/visualize/window.e2e.ts',
  output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-window',
} satisfies E2EConfig
