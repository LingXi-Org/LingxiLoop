#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const testsByScope = {
  server: [
    'server/src/__tests__/gateway-auth.test.ts',
    'server/src/__tests__/document-collaboration.test.ts',
    'server/src/__tests__/admin-platform.test.ts',
    'server/src/__tests__/coworker-activity-realtime.test.ts',
    'server/src/__tests__/api-module-boundaries.test.ts',
    'server/src/__tests__/domain-events.test.ts',
    'server/src/__tests__/entitlement-resolver.test.ts',
    'server/src/__tests__/llm-ledger.test.ts',
    'server/src/__tests__/agent-tool-registry.test.ts',
    'server/src/__tests__/research-search.test.ts',
    'server/src/__tests__/confidence-citations.test.ts',
    'server/src/__tests__/knowledge-retrieval.test.ts',
    'server/src/__tests__/native-evolution.test.ts',
    'server/src/__tests__/memory-scopes.test.ts',
    'server/src/__tests__/lingxilit-observability.test.ts',
    'server/src/__tests__/permission-policy.test.ts',
    'server/src/__tests__/storage-provider.test.ts',
    'server/src/__tests__/profile-avatar.test.ts',
    'server/src/__tests__/wukong-client.test.ts',
  ],
  admin: ['admin/src/lingxilit-url.test.ts', 'admin/src/record-presentation.test.ts', 'admin/src/management-session.test.ts'],
  web: [
    'src/components/assistant-ui/markdown-text.test.tsx',
    'src/features/chat/runtime/converter.test.ts',
    'src/features/chat/runtime/store.test.ts',
    'src/features/chat/runtime/harness.test.ts',
    'src/features/chat/components/ResearchSources.test.tsx',
    'src/features/chat/runtime/harness-api.test.ts',
    'src/features/chat/runtime/memory.test.ts',
    'src/components/assistant-ui/elements/memory-chips.test.tsx',
    'src/features/chat/runtime/run-updates.test.ts',
    'src/features/chat/runtime/attachment-messages.test.ts',
    'src/api/transport.test.ts',
    'src/features/knowledge/api.test.ts',
    'src/features/presentations/presentationFeature.test.ts',
    'src/features/settings/settingsDialog.test.ts',
    'src/features/learning/courseAvatar.test.ts',
    'src/features/learning/dashboard/learningVineModel.test.ts',
  ],
}

const scope = process.argv[2]
if (!Object.hasOwn(testsByScope, scope)) {
  console.error(`usage: node scripts/run-tests.mjs <${Object.keys(testsByScope).join('|')}>`)
  process.exit(2)
}
const changedFiles = JSON.parse(process.env.CI_TEST_FILES || '[]')
const prefix = { web: 'src/', admin: 'admin/', server: 'server/src/' }[scope]
if (!Array.isArray(changedFiles) || changedFiles.some((file) =>
  typeof file !== 'string' || !file.startsWith(prefix) || file.includes('..') || file.includes('\\') ||
  !/\.test\.tsx?$/.test(file) || file.startsWith('server/src/__integration__/'),
)) throw new Error('CI_TEST_FILES must contain test paths belonging to the selected scope')
// Deleted tests appear in the diff too; changed tests outside the smoke list still run.
const testFiles = [...new Set([...testsByScope[scope], ...changedFiles.filter(existsSync)])].map((file) => resolve(file))

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
