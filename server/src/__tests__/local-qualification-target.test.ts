import assert from 'node:assert/strict'
import test from 'node:test'
import { assertLocalQualificationTarget } from '../__integration__/_local-qualification-target.js'

test('qualification accepts only a disposable loopback PostgreSQL target without routing overrides', () => {
  assert.doesNotThrow(() => assertLocalQualificationTarget('postgres://fixture:fixture@127.0.0.1:18438/runtime342_visualize_test'))
  for (const target of [
    'postgres://127.0.0.1/runtime342_synthetic_test?host=remote.invalid',
    'postgres://127.0.0.1/runtime342_synthetic_test?host=%2Fvar%2Frun%2Fpostgresql',
    'postgres://127.0.0.1/runtime342_synthetic_test?port=5432',
    'postgres://remote.invalid/runtime342_synthetic_test',
    'postgres://127.0.0.1/production',
    'postgres://127.0.0.1/runtime342_visualize_test#ignored',
    'https://127.0.0.1/runtime342_visualize_test',
  ]) assert.throws(() => assertLocalQualificationTarget(target))
})
