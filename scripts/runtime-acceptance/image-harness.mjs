import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'
const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, '.e2e/image-acceptance')
mkdirSync(output, { recursive: true })
const docker = (...args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed: ${result.stderr.slice(-1200)}`)
  return result.stdout.trim()
}
const images = {
  baseline: 'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server@sha256:e6fb36579d98b8039f6f6146f7b4986daa5c308c7e87097125482c282570e11a',
  candidate: 'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server@sha256:7ef70169feeec2801fda81a27acaa11161e532daa25967acc96fe3178f6c7a11',
}
const network = 'lingxiloop-acceptance'
if (spawnSync('docker',['network','inspect',network],{stdio:'ignore'}).status !== 0) docker('network','create',network)
for (const name of ['lingxiloop-e2e-postgres-1','lingxiloop-e2e-redis-1','lingxiloop-e2e-wukongim-1','lingxiloop-acceptance-storage']) {
  const inspect = JSON.parse(docker('inspect',name))[0]
  if (!inspect.NetworkSettings.Networks[network]) docker('network','connect',network,name)
}
if (spawnSync('docker',['inspect','lingxiloop-acceptance-realtime'],{stdio:'ignore'}).status !== 0) {
  docker('run','-d','--name','lingxiloop-acceptance-realtime','--network',network,'redis:7-alpine')
}
const admin = new pg.Client({connectionString:'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/postgres'})
await admin.connect()
const s3 = new S3Client({endpoint:'http://127.0.0.1:59000',region:'auto',forcePathStyle:true,
  credentials:{accessKeyId:'lingxiloop-e2e',secretAccessKey:'lingxiloop-e2e-storage-local'}})
try { await s3.send(new CreateBucketCommand({Bucket:'lingxiloop-runtime-acceptance'})) }
catch (e) { if (!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name)) throw e }
s3.destroy()
const receipt = {startedAt:new Date().toISOString(),source:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),
  scope:'Immutable production Web/API images only. Worker blocked by kernel user-namespace restriction. No model-dialogue qualification.',
  limits:{cpus:0.75,memoryBytes:640*1024*1024,oldSpaceMiB:320,poolMax:8},images:{}}
try {
for (const [variant,image] of Object.entries(images)) {
  const database = `lingxiloop_acceptance_${variant}_test`
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`)
  const environment = {
    NODE_ENV:'production',DOTENV_CONFIG_PATH:'/nonexistent',PORT:'5181',DATABASE_POOL_MAX:'8',
    DATABASE_URL:`postgresql://postgres:lingxiloop-e2e-local@lingxiloop-e2e-postgres-1:5432/${database}`,
    REDIS_URL:`redis://lingxiloop-e2e-redis-1:6379/${variant==='baseline'?3:4}`,
    LINGXIOS_REALTIME_REDIS_URL:`redis://lingxiloop-acceptance-realtime:6379/${variant==='baseline'?3:4}`,
    OPENAI_API_KEY:'e2e-no-live-model',OPENAI_BASE_URL:'http://127.0.0.1:9/v1',OPENAI_MODEL:'e2e-unavailable',OPENAI_EMBEDDING_MODEL:'e2e-unavailable',
    LINGXILOOP_DISABLE_EMBEDDINGS:'1',LINGXILOOP_GATEWAY_HMAC_SECRET:'lingxiloop-e2e-local-gateway-secret-00000001',
    LINGXILOOP_PUBLIC_ORIGIN:'http://127.0.0.1:5180',LINGXILOOP_INVITE_BASE_URL:'http://127.0.0.1:5180',
    WUKONG_API_URL:'http://lingxiloop-e2e-wukongim-1:5001',WUKONG_WS_URL:'ws://127.0.0.1:55200',
    WUKONG_API_TOKEN:'e2e-local-token',WUKONG_WEBHOOK_SECRET:'lingxiloop-e2e-webhook',WUKONG_USER_TOKEN_SECRET:'lingxiloop-e2e-wukong-user-token-secret',
    R2_ENDPOINT:'http://lingxiloop-acceptance-storage:9000',R2_BUCKET:'lingxiloop-e2e',R2_ACCESS_KEY_ID:'lingxiloop-e2e',R2_SECRET_ACCESS_KEY:'lingxiloop-e2e-storage-local',
    R2_PUBLIC_BASE:'http://127.0.0.1:59000/lingxiloop-e2e',R2_URL_SIGNING_SECRET:'lingxiloop-e2e-url-signing-secret',
    LINGXIOS_R2_BUCKET:'lingxiloop-runtime-acceptance',LINGXIOS_R2_ACCESS_KEY_ID:'lingxiloop-e2e',LINGXIOS_R2_SECRET_ACCESS_KEY:'lingxiloop-e2e-storage-local',
    LINGXIOS_CONTROL_HOST:'127.0.0.1',LINGXIOS_CONTROL_PORT:'5182',LINGXIOS_SERVICE_TOKEN:'lingxiloop-e2e-runtime-service-token',
    AGENT_OS_INPUT_COST_MICROS_PER_MILLION:'1',AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION:'1',
    METRICS_BEARER_TOKEN:'lingxiloop-e2e-acceptance-metrics',ACCEPTANCE_OUTPUT:`/acceptance-output/${variant}`,
  }
  const envArgs = Object.entries(environment).flatMap(([key,value]) => ['-e',`${key}=${value}`])
  const name = `lingxiloop-acceptance-${variant}`
  assert.equal(spawnSync('docker',['inspect',name],{stdio:'ignore'}).status===0,false,`Existing ${name}; inspect before restarting`)
  docker('run','--rm','--network',network,...envArgs,image,'npm','run','db:migrate')
  const port = variant==='baseline'?5281:5283
  docker('run','-d','--name',name,'--network',network,'--cpus','0.75','--memory','640m','--memory-swap','640m',
    '-p',`127.0.0.1:${port}:5181`,'--mount',`type=bind,src=${resolve(root,'scripts/runtime-acceptance')},dst=/acceptance-harness,readonly`,
    '--mount',`type=bind,src=${output},dst=/acceptance-output`,...envArgs,image,
    'node','--max-old-space-size=320','--expose-gc','--import','/acceptance-harness/observe.mjs','--import','tsx','server/src/bin/web.ts')
  receipt.images[variant]={image,name,port,database,info:JSON.parse(docker('inspect',name))[0].Image}
}
} finally { await admin.end(); writeFileSync(`${output}/setup.json`,JSON.stringify(receipt,null,2)) }
console.log(JSON.stringify(receipt,null,2))
