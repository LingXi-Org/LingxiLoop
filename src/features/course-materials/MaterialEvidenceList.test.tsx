import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { MaterialEvidenceList } from './MaterialEvidenceList'

test('evidence rows expose source, excerpt, selection and truthful location availability through native buttons', () => {
  const matches = [
    { sourceId: 'pdf', sourceTitle: 'Attention PDF', chunkId: 'chunk:one', excerpt: 'Attention uses Q.',
      anchor: { type: 'extracted_text' as const, start: 0, end: 17 } },
    { sourceId: 'pdf', sourceTitle: 'Attention PDF', chunkId: 'chunk:two', excerpt: '<script>untrusted excerpt</script>', anchor: null },
  ]
  const $ = load(renderToStaticMarkup(<MaterialEvidenceList matches={matches} selectedId="chunk:one" previewId={null}
    hasPosition={match => !!match.anchor} onSelect={() => {}} onPreview={() => {}} />))
  assert.equal($('button[type="button"]').length, 2)
  assert.equal($('button[aria-pressed="true"]').length, 1)
  assert.match($('button').first().text(), /可定位解析文本/)
  assert.match($('button').last().text(), /仅摘录/)
  assert.match($.text(), /来源：Attention PDF/)
  assert.match($.text(), /已选中/)
  assert.equal($('script').length, 0)
  assert.doesNotMatch($.text(), /page|confidence|%|第\s*\d+\s*页/i)
})
