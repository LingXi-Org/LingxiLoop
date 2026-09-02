#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const testsByScope = {
  server: [
    'server/src/__tests__/gateway-auth.test.ts',
    'server/src/__tests__/admin-platform.test.ts',
    'server/src/__tests__/api-module-boundaries.test.ts',
    'server/src/__tests__/agent-os-authorization.test.ts',
    'server/src/__tests__/agent-os-tool.test.ts',
    'server/src/__tests__/domain-events.test.ts',
    'server/src/__tests__/entitlement-resolver.test.ts',
    'server/src/__tests__/llm-ledger.test.ts',
    'server/src/__tests__/lingxilit-observability.test.ts',
    'server/src/__tests__/permission-policy.test.ts',
    'server/src/__tests__/storage-provider.test.ts',
    'server/src/__tests__/wukong-client.test.ts',
  ],
  admin: ['admin/src/lingxilit-url.test.ts'],
  web: [
    'src/api/transport.test.ts',
    'src/features/presentations/presentationFeature.test.ts',
    'src/lib/userVisibleChinese.test.ts',
  ],
}

const scope = process.argv[2]
if (!Object.hasOwn(testsByScope, scope)) {
  console.error(`usage: node scripts/run-tests.mjs <${Object.keys(testsByScope).join('|')}>`)
  process.exit(2)
}
const testFiles = testsByScope[scope].map((file) => resolve(file))

const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--experimental-test-module-mocks', '--test', '--test-force-exit', '--test-concurrency=1', ...testFiles],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'unit-test-key',
      OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      WUKONG_USER_TOKEN_SECRET: process.env.WUKONG_USER_TOKEN_SECRET || 'unit-test-wukong-user-token-secret',
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://unit-tests@127.0.0.1:5432/lingxiloop',
      REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      R2_ENDPOINT: process.env.R2_ENDPOINT || 'http://127.0.0.1:9000',
      R2_BUCKET: process.env.R2_BUCKET || 'unit-tests',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || 'unit-test-key',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || 'unit-test-secret',
      R2_PUBLIC_BASE: process.env.R2_PUBLIC_BASE || 'https://assets.test.invalid',
      R2_URL_SIGNING_SECRET: process.env.R2_URL_SIGNING_SECRET || 'unit-test-signing-secret',
      LINGXILOOP_INVITE_BASE_URL: process.env.LINGXILOOP_INVITE_BASE_URL || 'https://app.test.invalid',
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 1))
