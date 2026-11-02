// Empty conversations must remain usable without downloading message renderers.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'

const result = await build({
  entryPoints: ['src/desktop/ChatPane.tsx'], bundle: true, write: false,
  format: 'esm', splitting: true, outdir: 'out', metafile: true, packages: 'external',
  alias: { '@': resolve('src') }, loader: { '.css': 'empty' },
})
const initial = new Set()
function visit(path) {
  if (initial.has(path)) return
  initial.add(path)
  const output = result.metafile.outputs[path]
  assert.ok(!Object.keys(output.inputs).includes('src/features/chat/components/ConversationThread.tsx'),
    'empty conversation eagerly imports its message renderer')
  for (const dependency of output.imports) {
    if (!dependency.external && dependency.kind !== 'dynamic-import') visit(dependency.path)
  }
}
visit('out/ChatPane.js')
console.log('PASS: empty conversation does not import the message renderer')
