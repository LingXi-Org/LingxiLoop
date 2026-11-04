import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { nativeOperatorMismatch, preserveLearningOperators } from '../forum/learning-operators'

test('679 operator symbols survive Markdown while intentional italics, lists and fenced code retain semantics', () => {
  const raw = '2+3*4、3*-2、a*b、x**2\n\n*斜体*\n\n* 列表\n\n```python\nx = 2+3*4\n```\n\n`a*b`'
  const html = renderToStaticMarkup(<ReactMarkdown>{preserveLearningOperators(raw)}</ReactMarkdown>)
  for (const text of ['2+3*4','3*-2','a*b','x**2']) assert.ok(html.includes(text), text)
  assert.match(html, /<em>斜体<\/em>/)
  assert.match(html, /<li>列表<\/li>/)
  assert.match(html, /<code class="language-python">x = 2\+3\*4/)
  assert.match(html, /<code>a\*b<\/code>/)
  assert.equal(preserveLearningOperators('2+3\\*4'), '2+3\\*4')
})

test('679 recoverable native operator disagreement is explicit; historical recovery copies are not substituted', () => {
  const blocks=[{type:'paragraph',content:[{text:'2+3',styles:{}},{text:'4、3',styles:{italic:true}},{text:'-2',styles:{}}],children:[]}]
  assert.equal(nativeOperatorMismatch({blocks},'2+3*4、3*-2'),true)
  assert.equal(nativeOperatorMismatch({blocks:[{content:[{text:'2+3*4、3*-2'}]}]},'2+3*4、3*-2'),false)
  assert.equal(nativeOperatorMismatch({blocks},'2+34'),false)
})
