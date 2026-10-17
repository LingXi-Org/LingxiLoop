// Fail closed on the frozen product dependency; --foundation-only explicitly
// runs only modules that do not import LingxiOS, with the limitation in receipts.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
let installed = null
try { installed = JSON.parse(readFileSync('node_modules/@lyyzka/lingxios/package.json', 'utf8')).version } catch {}
const frozen = installed === '3.4.7'
if (!frozen && !process.argv.includes('--foundation-only')) {
  throw new Error(`Frozen dependency gate: expected LingxiOS 3.4.7, installed ${installed ?? 'missing'}. Run npm ci before product acceptance.`)
}
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP|SYSTEMROOT)$/i.test(name)))
Object.assign(env, {
  DOTENV_CONFIG_PATH: '/tmp/s153p-no-dotenv',
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
  DATABASE_POOL_MAX: '2', REDIS_URL: 'redis://127.0.0.1:56379/0',
  S153P_FROZEN_DEPENDENCIES: String(frozen),
  OPENAI_API_KEY: 'unused-foundation-fixture', OPENAI_EMBEDDING_MODEL: 'unused-foundation-fixture',
  WUKONG_USER_TOKEN_SECRET: 'unused-foundation-fixture-secret',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',
})
const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/issue-153/regression.ts'], { env, stdio: 'inherit' })
process.exitCode = result.status ?? 1
