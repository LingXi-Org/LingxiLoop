import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { S3Client, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixtureEnv = new URL('../.env.e2e.local', import.meta.url)
if (existsSync(fixtureEnv)) process.loadEnvFile(fileURLToPath(fixtureEnv))
// This entry point always owns a disposable local database. It never loads .env.local.
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE|E2E_USER_\w+)$/i.test(name))),
  DOTENV_CONFIG_PATH: '.e2e/no-product-env', NODE_ENV: 'test', PORT: '5181',
  DATABASE_URL: 'postgres://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_browser_test',
  REDIS_URL: 'redis://127.0.0.1:56379/1',
  OPENAI_API_KEY: 'e2e-no-live-model', OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',
  OPENAI_MODEL: 'e2e-unavailable', OPENAI_EMBEDDING_MODEL: 'e2e-unavailable',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: process.env.E2E_KNOWLEDGE === '1' ? 'true' : 'false',
  OPEN_NOTEBOOK_URL: 'http://127.0.0.1:15055', OPEN_NOTEBOOK_PASSWORD: 'lingxiloop-e2e-notebook-local',
  RESEND_API_KEY: '', EMAIL_DOMAIN: 'e2e.lingxiloop.test', ALERT_WEBHOOK_URL: '',
  CONTROL_PLANE_BASE_URL: 'http://127.0.0.1:8797',
  LINGXILOOP_PUBLIC_ORIGIN: 'http://127.0.0.1:5180',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'lingxiloop-e2e-local-gateway-secret-00000001',
  WUKONG_API_URL: 'http://127.0.0.1:55001', WUKONG_WS_URL: 'ws://127.0.0.1:55200',
  WUKONG_API_TOKEN: 'e2e-local-token', WUKONG_WEBHOOK_SECRET: 'lingxiloop-e2e-webhook',
  WUKONG_USER_TOKEN_SECRET: 'lingxiloop-e2e-wukong-user-token-secret',
  R2_ENDPOINT: 'http://127.0.0.1:59000', R2_BUCKET: 'lingxiloop-e2e',
  R2_ACCESS_KEY_ID: 'lingxiloop-e2e', R2_SECRET_ACCESS_KEY: 'lingxiloop-e2e-storage-local',
  R2_PUBLIC_BASE: 'http://127.0.0.1:59000/lingxiloop-e2e',
  R2_URL_SIGNING_SECRET: 'lingxiloop-e2e-url-signing-secret',
  LINGXIOS_CONTROL_HOST: '127.0.0.1', LINGXIOS_CONTROL_PORT: '5182',
  LINGXIOS_CONTROL_URL: 'http://127.0.0.1:5182',
  LINGXIOS_SERVICE_TOKEN: 'lingxiloop-e2e-runtime-service-token',
  LINGXIOS_R2_BUCKET: '', LINGXIOS_REALTIME_REDIS_URL: '',
  AGENT_OS_HOMES_ROOT: '.e2e/runtime-homes',
}
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Local API command exited ${code}`)))
})
if (process.argv.includes('--worker')) {
  await run(['--import', 'tsx', 'e2e/worker.ts'])
  process.exit(0)
}
if (process.argv.includes('--api-only')) {
  await run(['--import', 'tsx', 'server/src/bin/web.ts'])
  process.exit(0)
}
await mkdir(new URL('../.e2e', import.meta.url), { recursive: true })
const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_browser_test', '/postgres') })
try {
  await admin.connect()
  const found = await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_browser_test'")
  if (!found.rowCount) await admin.query('CREATE DATABASE lingxiloop_browser_test')
} finally { await admin.end() }
await run(['--import', 'tsx', 'server/src/migrate-bin.ts'])
await run(['--import', 'tsx', 'e2e/seed.ts'])
const storage = new S3Client({ endpoint: env.R2_ENDPOINT, region: 'auto', forcePathStyle: true,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } })
try {
  try { await storage.send(new CreateBucketCommand({ Bucket: env.R2_BUCKET })) }
  catch (error) { if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists') throw error }
  // Mirror the production R2 gate: only profile avatars are public.
  await storage.send(new PutBucketPolicyCommand({
    Bucket: env.R2_BUCKET,
    Policy: JSON.stringify({ Version: '2012-10-17', Statement: [{
      Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${env.R2_BUCKET}/avatars/*`,
    }] }),
  }))
} finally { storage.destroy() }
if (!process.argv.includes('--seed-only')) await run(['--import', 'tsx', 'server/src/bin/web.ts'])
