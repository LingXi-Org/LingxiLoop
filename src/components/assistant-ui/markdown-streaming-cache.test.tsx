import assert from 'node:assert/strict'
import test from 'node:test'
import type { Element, Root } from 'hast'
import { createStreamingWordTokenizer, rehypeStreamingText, streamingWords } from './markdown-streaming'

function transform(tokenize: ReturnType<typeof createStreamingWordTokenizer>, texts: string[], opaque = false) {
  const tree: Root = {
    type: 'root',
    children: texts.map(value => ({
      type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value }],
    })),
  }
  if (opaque) tree.children.push({
    type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'text', value: 'const replacement = 1' }],
  })
  // Recreate the processor's plugin while keeping the React block's tokenizer.
  rehypeStreamingText({ tokenize })(tree)
  return texts.map((_, index) => {
    const paragraph = tree.children[index] as Element
    const leaf = paragraph.children[0] as Element
    return leaf.data!.streamingText!.words
  })
}

test('a shorter Markdown pass releases removed leaf tokens and keeps surviving append tokens', () => {
  const tokenize = createStreamingWordTokenizer()
  const texts = ['中́文 tail', 'removed first leaf', 'removed final leaf']
  const before = transform(tokenize, texts)
  const shorter = transform(tokenize, [texts[0]])
  assert.equal(shorter[0], before[0])

  const restored = transform(tokenize, [texts[0] + ' continues', ...texts.slice(1)])
  assert.equal(restored[0][0], before[0][0])
  assert.deepEqual(restored[0], streamingWords(texts[0] + ' continues'))
  for (const index of [1, 2]) {
    assert.notEqual(restored[index], before[index], `removed leaf ${index} must not remain cached`)
    assert.notEqual(restored[index][0], before[index][0])
    assert.deepEqual(restored[index], streamingWords(texts[index]))
  }
})

test('a Markdown pass with only opaque content releases every previous text leaf', () => {
  const tokenize = createStreamingWordTokenizer()
  const texts = ['replaced body', 'replaced tail']
  const before = transform(tokenize, texts)
  transform(tokenize, [], true)
  const restored = transform(tokenize, texts)
  for (const index of [0, 1]) {
    assert.notEqual(restored[index], before[index], `opaque replacement must release leaf ${index}`)
    assert.notEqual(restored[index][0], before[index][0])
    assert.deepEqual(restored[index], streamingWords(texts[index]))
  }
})

test('word offsets slice the original UTF-16 text at prefix and Unicode boundaries', () => {
  const tokenize = createStreamingWordTokenizer()
  for (const text of ['  中文\tLatin words\r\n字', '  中́文\t👨‍👩‍👧‍👦 café\n한 字']) {
    for (let length = 1; length <= text.length; length++) {
      const source = text.slice(0, length)
      const words = tokenize(source, 0)
      assert.deepEqual(words, streamingWords(source))
      let cursor = 0
      for (const [index, word] of words.entries()) {
        assert.equal(word.start, cursor)
        const value = (word.prefix ?? '') + word.word + (word.separator ?? '')
        cursor += value.length
        assert.equal(source.slice(word.start, words[index + 1]?.start), value)
      }
      if (words.length) assert.equal(cursor, source.length)
    }
  }
})
