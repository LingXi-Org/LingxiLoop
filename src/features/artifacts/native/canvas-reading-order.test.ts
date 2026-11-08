import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { artboardsInReadingOrder } from './canvas-reading-order'

const source = JSON.parse(readFileSync(new URL('../../../../scripts/fixtures/native-editors/source-design-board-preview.json', import.meta.url), 'utf8'))
for (const sample of source.readingOrder.cases) test(`画板导出顺序遵循固定源码：${sample.name}`, () => {
  const pages: Array<{ id: string; x: number; y: number; height: number }> = sample.pages.map(({ h, ...page }: { id: string; x: number; y: number; h: number }) => ({ ...page, height: h }))
  const before = JSON.stringify(pages)
  assert.deepEqual(artboardsInReadingOrder(Object.freeze(pages)).map(page => page.id), sample.order)
  assert.equal(JSON.stringify(pages), before)
})
