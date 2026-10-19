import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = resolve(root, 'third_party/zcode/upstream')
const output = resolve(root, 'server/assets/visualize-runtime')
const source = 'packages/desktop/src/renderer/src/plugin-sandbox/genUi.ts'
await mkdir(output, { recursive: true })
const result = await build({
  absWorkingDir: root,
  entryPoints: [resolve(upstream, source)],
  outfile: resolve(output, 'gen-ui.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120', 'firefox120', 'safari17'],
  minify: true,
  legalComments: 'inline',
  metafile: true,
  alias: { '@zcode/shared/gen-ui': resolve(upstream, 'packages/shared/src/gen-ui/index.ts') },
})
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const bytes = await readFile(resolve(output, 'gen-ui.js'))
const sources = Object.fromEntries(await Promise.all(Object.keys(result.metafile.inputs).sort().map(async name =>
  [relative(root, resolve(root, name)).replaceAll('\\', '/'), hash(await readFile(resolve(root, name)))],
)))
const manifest = {
  upstreamCommit: '0a1fc56d279fd1001f78387bd81aec1c26767411',
  entryPoint: source,
  files: { 'gen-ui.js': { sha256: hash(bytes), bytes: bytes.length } },
  sources,
}
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ file: 'gen-ui.js', ...manifest.files['gen-ui.js'], sourceCount: Object.keys(sources).length }))
