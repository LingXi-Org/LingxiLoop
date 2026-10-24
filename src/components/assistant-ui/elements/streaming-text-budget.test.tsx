import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { StreamingText } from './streaming-text'
import { createStreamingTail } from '../streaming-tail'
import { rehypeStreamingText, streamingWords } from '../markdown-streaming'
import type { Root } from 'hast'

test('Chinese animation wrappers stay bounded as received text grows without losing text', () => {
  for (const length of [1_000, 10_000]) {
    const text = '中'.repeat(length)
    const html = renderToStaticMarkup(<StreamingText segments={[]} tokens={Array.from(text, word => ({ word, separator: '' }))}
      count={length} streaming inline />)
    const $ = load(html)
    assert.equal($('[data-slot="streaming-text"]').text(), text)
    assert.ok($('[data-streaming-word]').length <= 128, `length=${length}: ${$('[data-streaming-word]').length} wrappers`)
    assert.equal($('[data-streaming-fresh="true"]').length, 2)
    assert.equal($('[data-streaming-caret]').length, 1)
  }
})

test('historical and reduced animation text has no character wrappers or caret', () => {
  const tokens = [{ word: '中́', separator: '\n', prefix: '  ' }, { word: '👨‍👩‍👧‍👦', separator: '\t' }, { word: 'test', separator: '' }]
  for (const streaming of [false, true]) {
    const html = renderToStaticMarkup(<StreamingText segments={[]} tokens={tokens} count={tokens.length} streaming={streaming} animate={false} caret={false} inline />)
    const $ = load(html)
    assert.equal($('[data-slot="streaming-text"]').text(), '  中́\n👨‍👩‍👧‍👦\ttest')
    assert.equal($('[data-streaming-word]').length, 0)
    assert.equal($('[data-streaming-caret]').length, 0)
  }
})

test('the animation budget is shared across blocks and unregisters the exact owner', () => {
  const tail = createStreamingTail()
  const first = tail.register('a', [0, 0], 100)
  const replaced = tail.register('b', [0, 1], 100)
  const last = tail.register('c', [0, 2], 20)
  assert.equal(tail.snapshot('c'), 256)
  assert.equal(tail.snapshot('b'), 20)
  assert.equal(tail.snapshot('a'), 120)
  assert.equal(20 + Math.min(100, 128 - tail.snapshot('b')) + Math.min(100, 128 - tail.snapshot('a')), 128)
  const replacement = tail.register('b', [0, 1], 128)
  replaced()
  assert.equal(tail.snapshot('a'), 128)
  last()
  assert.equal(tail.snapshot('b'), 256)
  replacement(); first()
  assert.equal(tail.snapshot('a'), 128)
})

test('opaque tails count earlier prose toward the block animation budget without decorating code', () => {
  const tree: Root = { type: 'root', children: [
    { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: '中'.repeat(200) }] },
    { type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'text', value: 'const untouched = 1' }] },
  ] }
  rehypeStreamingText()(tree)
  const caret = tree.children.at(-1)
  assert.equal(caret?.type === 'element' && caret.data?.streamingText?.blockWords, 128)
  assert.deepEqual(tree.children[1], { type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'text', value: 'const untouched = 1' }] })
})

test('Markdown token boundaries preserve combining marks, joined emoji and Hangul graphemes', () => {
  const text = '  中́文\t👨‍👩‍👧‍👦 café\n한 字'
  const words = streamingWords(text)
  assert.equal(words.map(word => (word.prefix ?? '') + word.word + word.separator).join(''), text)
  for (const token of ['中́', '👨‍👩‍👧‍👦', 'café', '한']) assert.ok(words.some(word => word.word === token), token)
})
