#!/usr/bin/env node
/**
 * R2 bucket CORS configurator.
 *
 * Why this exists: the client uploads images by asking the server for a
 * presigned PUT URL (POST /api/uploads/presign) and then PUTting the raw
 * bytes *directly from the browser* to R2 (see src/api/client.ts →
 * `uploadFile`). That cross-origin PUT triggers a CORS preflight, so the
 * R2 bucket itself must allow our renderer origins — the API server's
 * LINGXILOOP_CORS_ORIGINS does NOT cover it. Without a bucket CORS policy the
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
 *   node server/scripts/r2-cors.mjs https://loop.example.com https://admin.loop.example.com
 *
 * Inspect the current policy without changing anything:
 *
 *   node server/scripts/r2-cors.mjs --print
 *
 * Verify that the current policy supports every required origin:
 *
 *   node server/scripts/r2-cors.mjs --check
 */
import 'dotenv/config'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'
import {
  assertR2CorsRules,
  buildR2CorsRules,
  uniqueOrigins,
} from './r2-cors-policy.mjs'

// Origins that must be allowed to PUT directly to R2. Keep these in sync
// with how each surface loads its renderer:
//   - http://localhost:5173 → browser Vite dev (vite.config.ts `port`)
//   - http://localhost:5180 → Electron dev renderer (electron/main.cjs DEV_URL)
//   - app://lingxiloop          → packaged Electron (main.cjs loadURL app://lingxiloop/...)
//   - capacitor://localhost     → iOS Capacitor WebView
//   - https://localhost         → Android Capacitor WebView
// Extra origins (prod web, alternate ports, …) come from CLI args.
const cliArgs = process.argv.slice(2)
const printOnly = cliArgs.includes('--print')
const checkOnly = cliArgs.includes('--check')
const environmentOrigins = [
  process.env.LINGXILOOP_PUBLIC_ORIGIN ?? '',
  ...(process.env.R2_CORS_EXTRA_ORIGINS ?? '').split(','),
]
const extraOrigins = [...environmentOrigins, ...cliArgs.filter((a) => !a.startsWith('--'))]
const origins = uniqueOrigins(extraOrigins)

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

async function readCurrent(label) {
  try {
    const cur = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))
    const rules = cur.CORSRules ?? []
    console.log(`[r2-cors] ${label}:`, JSON.stringify(rules, null, 2))
    return rules
  } catch (e) {
    // R2 returns NoSuchCORSConfiguration when nothing is set yet.
    if (e?.name === 'NoSuchCORSConfiguration') {
      console.log(`[r2-cors] ${label}: (none set)`)
      return []
    }
    else throw e
  }
}

if (printOnly) {
  await readCurrent(`current CORS for ${R2_BUCKET}`)
  process.exit(0)
}

if (checkOnly) {
  const rules = await readCurrent(`current CORS for ${R2_BUCKET}`)
  assertR2CorsRules(rules, origins)
  console.log(`[r2-cors] verified presigned PUT policy for ${origins.length} origins`)
  process.exit(0)
}

await client.send(new PutBucketCorsCommand({
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: buildR2CorsRules(origins),
  },
}))

console.log(`[r2-cors] ✅ applied to bucket "${R2_BUCKET}" for origins:`)
for (const o of origins) console.log(`            - ${o}`)
const readback = await readCurrent('readback')
assertR2CorsRules(readback, origins)
console.log(`[r2-cors] verified presigned PUT policy for ${origins.length} origins`)
console.log('[r2-cors] done — no server restart needed; just retry the upload.')
