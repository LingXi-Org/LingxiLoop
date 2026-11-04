import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { legacyMarkdownHtml } from '@/features/content-editor/legacy'
import { remarkCurrencySafeMath } from './memos/remark-currency-safe-math'
import { nativeOperatorMismatch, preserveLearningOperators } from './learning-operators'

const render = (source: string) => renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkCurrencySafeMath, remarkGfm]}>{source}</ReactMarkdown>)

test('formula source and native math keep their literal operators through learning rendering and import', () => {
  for (const source of ['$2*3*4$', '$$\nx**2 + 2*3*4\n$$', 'Formula $$2*3*4$$.']) {
    const protectedSource = preserveLearningOperators(source)
    assert.equal(protectedSource, source)
    assert.equal(render(protectedSource), render(source))
    assert.equal(nativeOperatorMismatch({ blocks: [{ type: 'mathBlock', content: [{ type: 'text', text: '2*3*4', styles: {} }] }] }, source), false)
    assert.doesNotMatch(legacyMarkdownHtml(source, 'forum'), /katex-error|ParseError/)
  }
})

test('explicit and GFM automatic link destinations stay unchanged while arithmetic labels remain literal', () => {
  for (const source of [
    '<https://example.invalid/2*3*4>',
    'https://example.invalid/2*3*4',
    'www.example.invalid/2*3*4',
    '[result][ref]\n\n[ref]: <https://example.invalid/2*3*4>',
  ]) {
    assert.equal(preserveLearningOperators(source), source)
    assert.equal(render(preserveLearningOperators(source)), render(source))
  }
  assert.match(render(preserveLearningOperators('[2*3*4](https://example.invalid)')), />2\*3\*4<\/a>/)
})

test('mixed learning prose preserves operators, emphasis, code and currency boundaries', () => {
  const source = '2*3*4 and x**2\n\n*important*word foo*bar*baz\n\n* list\n\n`2*3*4`\n\n```python\nx = 2*3*4\n```\n\n$2*3*4$\n\nPrices $2*3*4 and $5.'
  const html = render(preserveLearningOperators(source))
  assert.match(html, /2\*3\*4 and x\*\*2/)
  assert.match(html, /<em>important<\/em>word foo<em>bar<\/em>baz/)
  assert.match(html, /<li>list<\/li>/)
  assert.match(html, /<code>2\*3\*4<\/code>/)
  assert.match(html, /<code class="language-python">x = 2\*3\*4/)
  assert.match(html, /class="language-math math-inline">2\*3\*4<\/code>/)
  assert.match(html, /Prices \$2\*3\*4 and \$5\./)
  assert.equal(preserveLearningOperators('2+3\\*4'), '2+3\\*4')
})
