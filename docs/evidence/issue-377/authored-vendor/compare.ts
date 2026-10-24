import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { mock } from 'node:test'
mock.module('/workspace/LingxiLoop/node_modules/html-to-image/dist/html-to-image.js?raw', { defaultExport: '/* capture fixture */' })
const { buildWebDocument: before } = await import('./document-before.ts')
const { buildWebDocument: after } = await import('/workspace/LingxiLoop/src/features/chat/visualize/web/document.ts')
const kit = await readFile('/workspace/LingxiLoop/third_party/zcode/skills/visualize/assets/visualize.html', 'utf8')
const kitHash = createHash('sha256').update(kit).digest('hex')
const authored = '<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script><script src="https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js"></script>'
for (const [name, fragment, hash] of [['pinned', '<svg/>', kitHash], ['pinned-authored', authored, kitHash], ['unknown-authored-calendar', '<viz-calendar/>' + authored, 'unknown-kit']]) {
  const source = async (resource: string) => resource === 'visualize.html' ? kit : `/* resource:${resource} */`
  const original = await before(fragment, null, source, hash)
  const result = await after(fragment, null, source, hash)
  assert.equal(result, original)
  console.log(JSON.stringify({ name, bytes: Buffer.byteLength(result), sha256: createHash('sha256').update(result).digest('hex'), byteEqual: true }))
}
