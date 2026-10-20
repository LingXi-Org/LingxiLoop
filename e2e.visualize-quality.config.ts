import type { E2EConfig } from 'e2e'
import base from './e2e.visualize-trigger-history.config'

export default {
  ...base,
  projectId: 'lingxiloop-217-numerical-content',
  // This is the retained historical red reproduction, not a passing acceptance
  // suite. Candidate generation runs separately under an explicit provider gate.
  tests: 'e2e/visualize/quality-red.e2e.ts',
  targets: base.targets.map(target => ({ ...target, app: { ...target.app, command: { ...target.app.command!,
    env: { ...target.app.command!.env, E2E_VISUALIZE_HISTORY_CASE: process.env.E2E_VISUALIZE_HISTORY_CASE ?? 'comparison' },
  } } })),
  assertionTimeout: 5000,
  output: process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-quality',
} satisfies E2EConfig
