import type { E2EConfig } from 'e2e'
import base from './e2e.config'
export default { ...base, projectId: 'lingxiloop-ui-release-combination', tests: ['e2e/web/**/*.e2e.ts', 'e2e/chat-213/**/*.e2e.ts'] } satisfies E2EConfig
