import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

assert.deepEqual(process.argv.slice(2),[])
const cwd = resolve(import.meta.dirname,'../..'), output = resolve(cwd,'artifacts/issue-298')
await mkdir(output,{ recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP|SYSTEMROOT)$/i.test(name)))
// Keep the earlier 3.8.1 reproduction database intact; 0053 was never deployed.
const databaseName = 'lingxiloop_visualize298_382_test'
Object.assign(env,{
  NODE_ENV: 'test',DOTENV_CONFIG_PATH: resolve(output,'__no_dotenv__'),
  DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  INTEGRATION_DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  REDIS_URL: 'redis://127.0.0.1:56379/6',OPENAI_API_KEY: 'synthetic-local-provider',OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_MODEL: 'synthetic-visual',OPENAI_EMBEDDING_MODEL: 'disabled',LINGXILOOP_DISABLE_EMBEDDINGS: '1',OPEN_NOTEBOOK_ENABLED: 'false',
  WUKONG_USER_TOKEN_SECRET: 'synthetic-visualize298-user-token',LINGXILOOP_GATEWAY_HMAC_SECRET: 'synthetic-visualize298-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',AGENT_OS_HOMES_ROOT: resolve(output,'runtime-homes'),
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1',AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
})
const log = resolve(output,'controlled.log')
await writeFile(log,'')
async function run(command,args) {
  await new Promise((resolve,reject) => {
    const child = spawn(command,args,{ cwd,env,stdio: ['ignore','pipe','pipe'] })
    for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk => { void appendFile(log,chunk); process.stdout.write(chunk) })
    child.once('error',reject)
    child.once('exit',code => code === 0 ? resolve() : reject(new Error(`Controlled regression exited ${code}`)))
  })
}
const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace(`/${databaseName}`,'/postgres') })
await admin.connect()
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName])).rowCount) await admin.query(`CREATE DATABASE ${databaseName}`)
} finally { await admin.end() }
await run(process.execPath,['--import','tsx','server/src/migrate-bin.ts'])
await run(process.execPath,['server/run-integration-tests.mjs','--file','visualize-incomplete-conversation.test.ts'])
