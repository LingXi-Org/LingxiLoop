import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error The production helper is plain ESM so Node can execute it directly.
import * as r2CorsPolicy from '../../scripts/r2-cors-policy.mjs'

const readText = (url: URL) => readFileSync(url, 'utf8').replaceAll('\r\n', '\n')

const {
  assertR2CorsRules,
  buildR2CorsRules,
  DEFAULT_R2_CORS_ORIGINS,
  uniqueOrigins,
  validateR2CorsRules,
} = r2CorsPolicy

test('R2 policy covers Web and Electron presigned PUT preflights', () => {
  const origins = uniqueOrigins(['https://loop.example.com/'])
  const rules = buildR2CorsRules(origins)

  assert.ok(origins.includes('http://localhost:5173'))
  assert.ok(origins.includes('app://lingxiloop'))
  assert.ok(origins.includes('https://loop.lingxilearn.cn'))
  assert.ok(origins.includes('https://loop.example.com'))
  assert.deepEqual(validateR2CorsRules(rules, origins), [])
  assert.doesNotThrow(() => assertR2CorsRules(rules, origins))
})

test('R2 readback validation rejects a policy without Electron PUT access', () => {
  const webOnly = buildR2CorsRules(['https://loop.example.com']).map((rule: { AllowedOrigins: string[] }) => ({
    ...rule,
    AllowedOrigins: rule.AllowedOrigins.filter((origin) => origin !== 'app://lingxiloop'),
  }))
  const errors = validateR2CorsRules(webOnly, DEFAULT_R2_CORS_ORIGINS)

  assert.ok(errors.some((error: string) => error.includes('app://lingxiloop')))
  assert.throws(
    () => assertR2CorsRules(webOnly, DEFAULT_R2_CORS_ORIGINS),
    /R2 CORS readback verification failed/,
  )
})

test('production deployment applies and verifies R2 CORS before cutover', () => {
  const compose = readText(new URL('../../../docker-compose.production.yml', import.meta.url))
  const deploy = readText(new URL('../../../scripts/deploy-production.sh', import.meta.url))
  const cors = readText(new URL('../../scripts/r2-cors.mjs', import.meta.url))

  assert.match(compose, /\n {2}r2-cors:\n[\s\S]*command: \["node", "server\/scripts\/r2-cors\.mjs"\]/)
  assert.match(deploy, /! configure_r2_cors \|\|\n\s+! compose up -d --remove-orphans/)
  assert.doesNotMatch(deploy, /run --rm migrate/)
  assert.match(deploy, /compose --profile tools run --rm --no-deps r2-cors/)
  assert.match(cors, /assertR2CorsRules\(readback, origins\)/)
})
