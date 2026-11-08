import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { designPlaybackGroups } from './canvas-playback'
const source = JSON.parse(readFileSync(new URL('../../../../scripts/fixtures/native-editors/source-design-playback.json', import.meta.url), 'utf8'))
for (const sample of source.cases) test(`播放画板分组遵循固定源码：${sample.name}`, () => {
  const pages: Array<{ id: string; x: number; y: number; height: number; interactive?: boolean; frameless?: boolean }> = sample.pages.map(({ h, is_interactive, ...page }: { id: string; x: number; y: number; h: number; is_interactive?: boolean; frameless?: boolean }) => ({ ...page, height: h, interactive: is_interactive }))
  const before = JSON.stringify(pages), result = designPlaybackGroups(pages)
  assert.deepEqual({ prototypes: result.prototypes.map(page => page.id), others: result.others.map(page => page.id) }, sample.expected)
  assert.equal(JSON.stringify(pages), before)
})
