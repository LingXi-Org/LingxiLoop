#!/usr/bin/env node
/**
 * R2 bucket CORS configurator.
 *
 * Why this exists: the client uploads images by asking the server for a
 * presigned PUT URL (POST /api/uploads/presign) and then PUTting the raw
 * bytes *directly from the browser* to R2 (see src/api/client.ts →
 * `uploadFile`). That cross-origin PUT triggers a CORS preflight, so the
 * R2 bucket itself must allow our renderer origins — the API server's
 * CUMORA_CORS_ORIGINS does NOT cover it. Without a bucket CORS policy the
 * preflight gets no Access-Control-Allow-Origin and the browser rejects
 * the request as a bare "TypeError: Failed to fetch" (no status, because
 * no response ever came back).
 *
 * This script reuses the same R2_* credentials the server runs with and
 * pushes a CORS policy via the S3 API, so you never have to open the
 * Cloudflare dashboard. It's idempotent — re-run any time you add an
 * origin or rotate buckets.
 *
 * Run from the repo root (so dotenv finds .env):
 *
 *   node server/scripts/r2-cors.mjs
 *
 * Add extra origins (e.g. a prod web domain) as CLI args — they're merged
 * with the built-in dev/Electron defaults:
 *
 *   node server/scripts/r2-cors.mjs https://cumora.ai https://app.cumora.ai
 *
 * Inspect the current policy without changing anything:
 *
 *   node server/scripts/r2-cors.mjs --print
 */
import 'dotenv/config'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

// Origins that must be allowed to PUT directly to R2. Keep these in sync
// with how each surface loads its renderer:
//   - http://localhost:5173 → browser Vite dev (vite.config.ts `port`)
//   - http://localhost:5180 → Electron dev renderer (electron/main.cjs DEV_URL)
//   - app://cumora          → packaged Electron (main.cjs loadURL app://cumora/...)
// Extra origins (prod web, alternate ports, …) come from CLI args.
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5180',
  'app://cumora',
]

const cliArgs = process.argv.slice(2)
const printOnly = cliArgs.includes('--print')
const extraOrigins = cliArgs.filter((a) => !a.startsWith('--'))
const origins = [...new Set([...DEFAULT_ORIGINS, ...extraOrigins])]

const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
const missing = [
  ['R2_ENDPOINT', R2_ENDPOINT],
  ['R2_BUCKET', R2_BUCKET],
  ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
  ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
].filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`[r2-cors] missing env: ${missing.join(', ')}`)
  console.error('          Run from the repo root so .env is loaded, or export the R2_* vars.')
  process.exit(1)
}

const client = new S3Client({
  region: 'auto',                 // R2 is single-region; "auto" is the documented value.
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,           // Mirrors server/src/storage.ts so the same creds/host work.
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function printCurrent(label) {
  try {
    const cur = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))
    console.log(`[r2-cors] ${label}:`, JSON.stringify(cur.CORSRules ?? [], null, 2))
  } catch (e) {
    // R2 returns NoSuchCORSConfiguration when nothing is set yet.
    if (e?.name === 'NoSuchCORSConfiguration') console.log(`[r2-cors] ${label}: (none set)`)
    else throw e
  }
}

if (printOnly) {
  await printCurrent(`current CORS for ${R2_BUCKET}`)
  process.exit(0)
}

await client.send(new PutBucketCorsCommand({
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: origins,
        // PUT is what the browser upload does. GET/HEAD are harmless and
        // cover any future cross-origin presigned read.
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        // "*" so the preflight's Access-Control-Request-Headers (Content-Type,
        // and anything we add later) always passes.
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      },
    ],
  },
}))

console.log(`[r2-cors] ✅ applied to bucket "${R2_BUCKET}" for origins:`)
for (const o of origins) console.log(`            - ${o}`)
await printCurrent('readback')
console.log('[r2-cors] done — no server restart needed; just retry the upload.')
