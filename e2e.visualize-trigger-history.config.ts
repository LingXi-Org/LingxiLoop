import type { E2EConfig } from 'e2e'
import base from './e2e.visualize-live.config'
export default { ...base, projectId: 'lingxiloop-213-217-real-history', tests: 'e2e/visualize/trigger-history.e2e.ts',
  targets: base.targets.map(target => ({ ...target, app: { ...target.app, command: { executable: process.execPath,
    args: ['--import', 'tsx', 'e2e/visualize/serve-trigger-history.mjs'], startupTimeout: 300000,
    env: { DATABASE_URL: process.env.INTEGRATION_DATABASE_URL ?? '', REDIS_URL: process.env.REDIS_URL ?? '', NODE_ENV: 'test',
      AGENT_OS_HOMES_ROOT: process.env.AGENT_OS_HOMES_ROOT ?? '',
      WUKONG_USER_TOKEN_SECRET: 'issue213217-local-test-secret', OPENAI_API_KEY: 'unused-history-fixture', OPENAI_MODEL: 'zai-org/GLM-5.3-Flash',
      OPENAI_EMBEDDING_MODEL: 'Qwen/Qwen3-Embedding-8B', LINGXILOOP_DISABLE_EMBEDDINGS: '1', LINGXILOOP_INVITE_BASE_URL: 'http://localhost:5195',
    },
  } } })),
  output: process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-trigger-history',
} satisfies E2EConfig
