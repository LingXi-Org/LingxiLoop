import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { STREAMING_WORD_BUDGET, StreamingText } from './streaming-text'
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

// The DOM budget must also bound token reads: copying or joining the complete
// already-readable prefix on every streamed update still grows with history.
test('source-backed leaves read only the animation window and static range boundaries', t => {
  for (const length of [1_000, 10_000]) {
    const text = '中'.repeat(length)
    for (const streaming of [true, false]) {
      let reads = 0
      const tokens = new Proxy(Array.from(text, (word, start) => ({ word, start, separator: '' })), {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) reads++
          return Reflect.get(target, property, receiver)
        },
      })
      const html = renderToStaticMarkup(<StreamingText segments={[]} tokens={tokens} sourceText={text}
        count={length} streaming={streaming} inline />)
      const $ = load(html)
      assert.equal($('[data-slot="streaming-text"]').text(), text)
      assert.ok(reads <= (streaming ? STREAMING_WORD_BUDGET : 0) + 4,
        `${length} words, streaming=${streaming}: ${reads} token reads`)
      t.diagnostic(`${length} words, streaming=${streaming}: ${reads} token reads`)
    }
  }
})

test('source-backed static text preserves Unicode, whitespace and normalized partial counts', () => {
  const text = '  中́文\t👨‍👩‍👧‍👦 café\n한 字'
  const tokens = streamingWords(text)
  for (const [count, expected] of [[-1, ''], [Number.NaN, ''], [2.8, '  中́文\t'], [Infinity, text]] as const) {
    for (const streaming of [true, false]) {
      const html = renderToStaticMarkup(<StreamingText segments={[]} tokens={tokens} sourceText={text}
        count={count} streaming={streaming} animate={false} caret={false} inline />)
      const $ = load(html)
      assert.equal($('[data-slot="streaming-text"]').text(), expected)
      assert.equal($('[data-streaming-word]').length, 0)
    }
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

// Failure modes: append mutates committed tokens, split Unicode changes the
// preceding boundary, a mode switch reuses incompatible tokens, or a rebuilt
// plugin/changed leaf accidentally inherits another leaf's words.
test('incremental words match full tokenization for every Unicode append and replacement', async () => {
  const { createStreamingWordTokenizer } = await import('../markdown-streaming')
  const tokenize = createStreamingWordTokenizer()
  const samples = [
    '  中文\tLatin words\r\n👨‍👩‍👧‍👦 café 中́ 한 字',
    '中🇦🇧🇨🇩🇪🇫文👩🏽‍💻 字\r\n\t', '中\u200d👩\u200d💻 cafe\u0301',
    '中\u0301\u0300\u200d👩  \n', ' \t\n', '', 'replacement 正文',
    '中́\n\n 🏽 ',
  ]
  for (const sample of samples) {
    for (let length = 0; length <= sample.length; length++) {
      const text = sample.slice(0, length)
      const actual = tokenize(text, 0)
      assert.deepEqual(actual.slice(), streamingWords(text), JSON.stringify(text))
      if (actual.length) assert.equal(actual.slice().map(token => (token.prefix ?? '') + token.word + token.separator).join(''), text)
    }
  }
  for (const text of ['same text', 'same text', 'short', '完全替换́', '', '新文本']) {
    assert.deepEqual(tokenize(text, 0).slice(), streamingWords(text))
  }
  const previous = tokenize('中́文 test ', 1)
  const frozen = structuredClone(previous.slice())
  const next = tokenize('中́文 test more', 1)
  assert.deepEqual(previous.slice(), frozen)
  assert.equal(next.at(0), previous.at(0))
  assert.deepEqual(next.slice(), streamingWords('中́文 test more'))
  assert.deepEqual(tokenize('other leaf', 0).slice(), streamingWords('other leaf'))
})

test('rebuilt streaming plugins reuse a block tokenizer and preserve leaf text and positions', async () => {
  const { createStreamingWordTokenizer } = await import('../markdown-streaming')
  const tokenize = createStreamingWordTokenizer()
  function transform(text: string) {
    const position = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: text.length + 1, offset: text.length } }
    const tree: Root = { type: 'root', children: [{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: text, position }] }] }
    rehypeStreamingText({ tokenize })(tree)
    const paragraph = tree.children[0]
    assert.equal(paragraph.type, 'element')
    if (paragraph.type !== 'element' || paragraph.children[0].type !== 'element') throw new Error('missing streaming leaf')
    const leaf = paragraph.children[0]
    assert.deepEqual(leaf.children[0], { type: 'text', value: text, position })
    return leaf.data!.streamingText!.words
  }
  const first = transform('中́文 tail')
  const second = transform('中́文 tail continues')
  assert.equal(first.at(0), second.at(0))
  assert.deepEqual(second.slice(), streamingWords('中́文 tail continues'))
})

test('retained word snapshots keep exact text and original indexes after append and replacement', async () => {
  const { createStreamingWordTokenizer } = await import('../markdown-streaming')
  const tokenize = createStreamingWordTokenizer()
  const snapshots = []
  let text = '中'.repeat(200) + ' tail'
  for (const delta of ['', ' grows ', '新'.repeat(140), '\t中́ 👨‍👩‍👧‍👦', '\n한 字']) {
    text += delta
    const words = tokenize(text, 0)
    snapshots.push({ text, words, expected: structuredClone(streamingWords(text)) })
  }
  tokenize('whole replacement', 0)
  tokenize.finishPass(0)
  for (const { text: sourceText, words, expected } of snapshots) {
    assert.deepEqual(words.slice(), expected)
    for (const index of [-1, 0, 127, 128, words.length - 1, words.length, NaN, Infinity]) {
      assert.deepEqual(words.at(index), expected.at(index))
    }
    assert.deepEqual(words.slice(-130, -1), expected.slice(-130, -1))
    assert.deepEqual(words.slice(NaN, Infinity), expected.slice(NaN, Infinity))
    const html = renderToStaticMarkup(<StreamingText segments={[]} tokens={words} sourceText={sourceText}
      count={words.length} streaming inline />)
    const $ = load(html)
    assert.equal($('[data-slot="streaming-text"]').text(), sourceText)
    assert.equal($('[data-streaming-word]').length, STREAMING_WORD_BUDGET)
  }
})
