/**
 * Bundle the agent-loop subtree into a single CommonJS file that runs
 * inside the lingxiloop-agent-computer image.
 *
 * Entry: server/src/agents/runtime/pod-agent.ts — long-running event
 * loop subscribing to /runtime/wake-stream over SSE. One Pod per
 * agent; the same process processes every wake event for that agent.
 *
 * Output: dist/agent/agent-computer.cjs
 *
 * Notes:
 *   - platform: node — node built-ins (fs, http, crypto, …) stay external
 *   - format: cjs — single file, simple to launch via `node bundle.cjs`
 *   - no minify; we want readable stack traces in pod logs
 *   - inline sourcemaps so a crash gives us original line numbers
 *   - bundle EVERYTHING else (openai, pg, ioredis, dotenv, …); the image
 *     is a debian:slim with node only, no `npm install` step at runtime
 *   - the bundle covers BOTH inproc and http runtime paths; the pod
 *     selects http via env, but bundling both keeps `select.ts` trivial
 *     and lets the same artifact run subprocess-style on the host too
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// server/src/scripts → ../../.. = repo root
const repoRoot = resolve(here, '..', '..', '..')

const result = await build({
  entryPoints: [resolve(repoRoot, 'server/src/agents/runtime/pod-agent.ts')],
  outfile: resolve(repoRoot, 'dist/agent/agent-computer.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'inline',
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  // Mark optional native deps as external. pg has pg-native as an
  // optional binding; openai has an undici-shim path that we don't use.
  // Anything we *don't* mark external gets bundled.
  external: ['pg-native'],
  // dotenv tries to read .env from cwd — that's fine in a pod (no file
  // present, silently skipped). No banner needed for ESM-to-CJS shim
  // because we're already emitting CJS.
})

if (result.errors.length > 0) {
  console.error('[agent-bundle] build failed')
  process.exit(1)
}
console.log(`[agent-bundle] ok → dist/agent/agent-computer.cjs`)
