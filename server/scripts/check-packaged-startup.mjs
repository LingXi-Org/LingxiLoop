import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Run the production launcher against the files in this package, not a source
// checkout. Static imports must link before the existing fail-fast env check.
// No credentials, .env file, database, Redis, or provider are needed.
for (const service of ['web', 'worker']) {
  const result = spawnSync(process.execPath, [
    fileURLToPath(import.meta.resolve('tsx/cli')), `server/src/bin/${service}.ts`,
  ], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { NODE_ENV: 'production', DOTENV_CONFIG_PATH: '/dev/null', TSX_DISABLE_CACHE: '1' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.ifError(result.error)
  assert.equal(result.status, 1, `${service}: expected the no-credentials environment guard`)
  assert.match(output, /\[env\] Missing required environment variable: DATABASE_URL/,
    `${service}: packaged entrypoint failed before environment validation\n${output}`)
  assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError/)
  console.log(`${service}: packaged entrypoint linked; stopped at environment validation`)
}
