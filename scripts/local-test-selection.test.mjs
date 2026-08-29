import assert from 'node:assert/strict'
import test from 'node:test'
import { selectLocalTests } from './local-test-selection.mjs'

const tests = [
  'server/src/__tests__/identity-oauth.test.ts',
  'server/src/__tests__/schema-v1.test.ts',
  'src/api/domain-boundaries.test.ts',
  'src/features/chat/state/messageProjection.test.ts',
  'src/lib/frontendArchitecture.test.ts',
]

test('selects only a changed test or a direct sibling', () => {
  assert.deepEqual(selectLocalTests(tests, [
    'src/features/chat/state/messageProjection.ts',
  ]), ['src/features/chat/state/messageProjection.test.ts'])
  assert.deepEqual(selectLocalTests(tests, [
    'src/features/chat/state/messageProjection.test.ts',
  ]), ['src/features/chat/state/messageProjection.test.ts'])
})

test('does not append feature, domain, or architecture suites', () => {
  assert.deepEqual(selectLocalTests(tests, ['src/components/AppShell.tsx']), [])
  assert.deepEqual(selectLocalTests(tests, ['server/src/modules/identity/application.ts']), [])
})

test('keeps the explicit schema mapping and explicit owning tests', () => {
  assert.deepEqual(selectLocalTests(
    tests,
    ['server/src/db/schema.sql'],
    ['server/src/__tests__/identity-oauth.test.ts'],
  ), [
    'server/src/__tests__/identity-oauth.test.ts',
    'server/src/__tests__/schema-v1.test.ts',
  ])
})
