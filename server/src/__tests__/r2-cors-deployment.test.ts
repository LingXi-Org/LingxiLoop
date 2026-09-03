import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error The production helper is plain ESM so Node can execute it directly.
import * as r2CorsPolicy from '../../scripts/r2-cors-policy.mjs'

const {
  assertR2CorsRules,
  buildR2CorsRules,
  DEFAULT_R2_CORS_ORIGINS,
  uniqueOrigins,
  validateR2CorsRules,
} = r2CorsPolicy

test('R2 policy covers Web presigned PUT preflights', () => {
  const origins = uniqueOrigins(['https://loop.example.com/'])
  const rules = buildR2CorsRules(origins)

  assert.ok(origins.includes('http://localhost:5173'))
  assert.ok(origins.includes('https://loop.lingxilearn.cn'))
  assert.ok(origins.includes('https://loop.example.com'))
  assert.deepEqual(validateR2CorsRules(rules, origins), [])
  assert.doesNotThrow(() => assertR2CorsRules(rules, origins))
})

test('R2 readback validation rejects a policy without required Web PUT access', () => {
  const incomplete = buildR2CorsRules(DEFAULT_R2_CORS_ORIGINS).map((rule: { AllowedOrigins: string[] }) => ({
    ...rule,
    AllowedOrigins: rule.AllowedOrigins.filter((origin) => origin !== 'https://loop.lingxilearn.cn'),
  }))
  const errors = validateR2CorsRules(incomplete, DEFAULT_R2_CORS_ORIGINS)

  assert.ok(errors.some((error: string) => error.includes('https://loop.lingxilearn.cn')))
  assert.throws(
    () => assertR2CorsRules(incomplete, DEFAULT_R2_CORS_ORIGINS),
    /R2 CORS readback verification failed/,
  )
})
