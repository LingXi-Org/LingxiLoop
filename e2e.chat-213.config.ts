import type { E2EConfig } from 'e2e'
import base from './e2e.question-index.config'
export default { ...base, projectId: 'lingxiloop-chat-213', tests: 'e2e/chat-213/*.e2e.ts', output: process.env.E2E_CHAT_OUTPUT ?? '.e2e/chat-213' } satisfies E2EConfig
