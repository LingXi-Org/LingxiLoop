// Exact synthetic environment used by the short checks; inherited provider and
// production settings are intentionally excluded. Run from the repository root.
import { spawnSync } from 'node:child_process'
import { dirname, delimiter } from 'node:path'
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP|SYSTEMROOT)$/i.test(name)))
Object.assign(env, {
 DOTENV_CONFIG_PATH: '/tmp/lingxi-basic-no-dotenv', NODE_ENV: 'test',
 DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
 INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
 REDIS_URL: 'redis://127.0.0.1:56379/0', LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/0',
 OPENAI_API_KEY: 'integration-test-key', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
 LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180', LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
 WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret', AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1',
 AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1', LINGXILOOP_DISABLE_EMBEDDINGS: '1', RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0',
})
// The owning runner launches `node` by name; preserve the selected Node version.
env.PATH = dirname(process.execPath) + delimiter + env.PATH
const args=process.argv.slice(2)
const result=spawnSync(process.execPath,args,{env,stdio:'inherit'})
process.exitCode=result.status??1
