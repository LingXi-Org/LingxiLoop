import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'
export default { ...base, projectId: 'lingxiloop-213-217', tests: 'e2e/visualize/loading.e2e.ts',
  targets: base.targets.map(target => ({ ...target, app: { ...target.app, command: { ...target.app.command,
    env: { E2E_VISUALIZE_RESOURCE_DELAY: process.env.E2E_VISUALIZE_RESOURCE_DELAY ?? '0' },
  } } })), output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-loading' } satisfies E2EConfig
