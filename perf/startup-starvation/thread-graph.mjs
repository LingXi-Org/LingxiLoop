// Static (non-lazy) import weight of the conversation thread, grouped by package.
// node perf/startup-starvation/thread-graph.mjs <repo-root>   (DETAIL=<path> lists files)
import { createRequire } from 'node:module'
const { build } = createRequire(process.argv[2] + '/package.json')('esbuild')
import { resolve } from 'node:path'
const root = process.argv[2]
const result = await build({ absWorkingDir: root, entryPoints: ['src/features/chat/components/ConversationThread.tsx'], bundle: true, write: false, format: 'esm', splitting: true, outdir: 'out', metafile: true, minify: true,
  alias: { '@': resolve(root, 'src') }, loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.png': 'empty', '.svg': 'empty' }, logLevel: 'error' })
const main = result.metafile.outputs['out/ConversationThread.js']
const seen = new Set(); const sizes = new Map()
const visit = (path) => { if (seen.has(path)) return; seen.add(path); const o = result.metafile.outputs[path]
  for (const [input, { bytesInOutput }] of Object.entries(o.inputs)) { const key = input.replace(/^.*node_modules\/((@[^/]+\/)?[^/]+).*$/, '$1').replace(/^(src\/[^/]+\/[^/]+).*$/, '$1'); sizes.set(key, (sizes.get(key) ?? 0) + bytesInOutput) }
  for (const d of o.imports) if (!d.external && d.kind !== 'dynamic-import') visit(d.path) }
visit('out/ConversationThread.js')
const total = [...sizes.values()].reduce((a, b) => a + b, 0)
console.log('static minified bytes', total)
if (process.env.DETAIL) { const files = new Map(); for (const p of seen) for (const [i, { bytesInOutput }] of Object.entries(result.metafile.outputs[p].inputs)) if (i.includes(process.env.DETAIL)) files.set(i, bytesInOutput); console.log([...files].sort((a, b) => b[1] - a[1]).slice(0, 12)) }
for (const [k, v] of [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(v).padStart(8), k)
