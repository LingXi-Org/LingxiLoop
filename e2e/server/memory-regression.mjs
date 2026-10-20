import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import pg from 'pg'

// Fail closed on unknown flags, non-test DBs and missing live-model opt-in/credentials.
const defaultFiles = ['memory-latency.test.ts','memory-continuity.test.ts','native-memory.test.ts','memory-summaries.test.ts','teacher-agent.test.ts','migration.test.ts','group-mentions.test.ts',
  'learning-collaboration.test.ts','runtime-context-latency.test.ts','attachment-answers.test.ts','confidence-citations.test.ts',
  'agent-protocols.test.ts','im-conversation-style.test.ts']
assert.ok(process.argv.slice(2).every(arg => ['--live-memory','--live-continuity'].includes(arg) || defaultFiles.includes(arg)))
const continuity=process.argv.includes('--live-continuity')
const live = continuity || process.argv.includes('--live-memory')
assert.ok(!(continuity && process.argv.includes('--live-memory')),'choose one live suite')
const selected = process.argv.slice(2).filter(arg => !['--live-memory','--live-continuity'].includes(arg))
assert.ok(!live || !selected.length,'live evaluation uses its own isolated suite')
const qualification = process.env.MEMORY_CONTINUITY_QUALIFICATION ?? ''
const continuityDatabases = {'':'lingxiloop_memory_continuity_model_test','1':'lingxiloop_memory_continuity_qualification_test',
  candidate:'lingxiloop_memory_continuity_candidate_test',final:'lingxiloop_memory_continuity_final_test',
  scoped:'lingxiloop_memory_continuity_scoped_test',combined358:'lingxiloop_memory_continuity_combined358_test'}
assert.ok(Object.hasOwn(continuityDatabases,qualification),'unknown continuity qualification target')
const databaseName = continuity ? continuityDatabases[qualification] : live ? 'lingxiloop_release_memory_model_test' : 'lingxiloop_release_memory_test'
const cwd = resolve(import.meta.dirname,'../..'), output = resolve(cwd,'artifacts/memory',continuity ? 'continuity-live' : live ? 'live' : 'integration')
await mkdir(output,{ recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE|HTTPS?_PROXY|NO_PROXY|NODE_USE_ENV_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test',DOTENV_CONFIG_PATH: resolve(output,'__no_dotenv__'),
  DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  INTEGRATION_DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  REDIS_URL: 'redis://127.0.0.1:56379/5', OPENAI_API_KEY: 'memory-fixture-no-live-model',
  OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',OPENAI_MODEL: 'memory-fixture',OPENAI_EMBEDDING_MODEL: 'disabled',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1',OPEN_NOTEBOOK_ENABLED: 'false',RESEND_API_KEY: '',ALERT_WEBHOOK_URL: '',
  WUKONG_USER_TOKEN_SECRET: 'memory-isolated-user-token',LINGXILOOP_GATEWAY_HMAC_SECRET: 'memory-isolated-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:52996',AGENT_OS_HOMES_ROOT: resolve(output,'runtime-homes'),
  LINGXIOS_LIVE_MEMORY: live ? '1' : '0',
  MEMORY_LATENCY_LABEL: process.env.MEMORY_LATENCY_LABEL==='candidate' ? 'candidate' : 'baseline',
})
if (live) {
  const credentials = process.env.EVAL_CANDIDATE_API_KEY ? process.env : parse(await readFile(resolve(cwd,'eval/.env.local')))
  for (const key of ['BASE_URL','MODEL','API_KEY','INPUT_CNY_PER_MILLION','OUTPUT_CNY_PER_MILLION']) assert.ok(credentials[`EVAL_CANDIDATE_${key}`]?.trim(),`Missing EVAL_CANDIDATE_${key}`)
  Object.assign(env, { OPENAI_API_KEY: credentials.EVAL_CANDIDATE_API_KEY,OPENAI_BASE_URL: credentials.EVAL_CANDIDATE_BASE_URL,
    OPENAI_MODEL: credentials.EVAL_CANDIDATE_MODEL,AGENT_OS_MAX_MODEL_CALLS: '20',AGENT_OS_MAX_MODEL_TOKENS: '150000',
    AGENT_OS_MAX_MODEL_COST_MICROS: '200000',AGENT_OS_MAX_WORK_MS: '180000',
    AGENT_OS_INPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_INPUT_CNY_PER_MILLION)/7*1e6)),
    AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION)/7*1e6)) })
  if(continuity) {
    assert.ok(process.env.OPENAI_EMBEDDING_MODEL?.trim(),'existing authorized embedding model is required')
    assert.equal(credentials.EVAL_CANDIDATE_BASE_URL,process.env.OPENAI_BASE_URL,'continuity uses the already authorized shared provider route')
    Object.assign(env,{OPENAI_EMBEDDING_MODEL:process.env.OPENAI_EMBEDDING_MODEL,LINGXILOOP_DISABLE_EMBEDDINGS:'0',
      LINGXIOS_LIVE_CONTINUITY:'1',MEMORY_CONTINUITY_QUALIFICATION:qualification,AGENT_OS_MAX_MODEL_TOKENS:'300000',AGENT_OS_MAX_MODEL_CALLS:'24',AGENT_OS_MAX_MODEL_COST_MICROS:'400000'})
  }
}
assert.equal(new URL(env.DATABASE_URL).pathname,`/${databaseName}`)
const log = resolve(output,'validation.log')
await writeFile(log,'')
await writeFile(resolve(output,'results.json'),JSON.stringify({ passed: false,live }))
async function run(args) {
  await new Promise((done,reject) => {
    const child = spawn(process.execPath,args,{ cwd,env,stdio: ['ignore','pipe','pipe'],windowsHide: true })
    for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk => { void appendFile(log,chunk); process.stdout.write(chunk) })
    child.once('error',reject)
    child.once('exit',code => code === 0 ? done() : reject(new Error(`Memory validation failed (${code}).`)))
  })
}
const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace(`/${databaseName}`,'/postgres') })
await admin.connect()
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName])).rowCount) await admin.query(`CREATE DATABASE ${databaseName}`)
} finally { await admin.end() }
await run(['--import','tsx','server/src/migrate-bin.ts'])
await run(['--import','tsx','server/src/migrate-bin.ts'])
const files = continuity ? ['memory-continuity-live.test.ts'] : live ? ['memory-live.test.ts'] : selected.length ? selected : defaultFiles
await run(['server/run-integration-tests.mjs',...files.flatMap(file => ['--file',file])])
await writeFile(resolve(output,'results.json'),JSON.stringify({ passed: true,live,files,
  reproduce: ['node e2e/server/memory-regression.mjs',...process.argv.slice(2)].join(' '),migrations: 'applied then no-op',qualification: 'source candidate; exact published dependency remains a release gate' },null,2))
