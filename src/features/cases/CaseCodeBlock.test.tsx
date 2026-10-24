import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { CaseCodeBlock } from './CaseCodeBlock'
import { legacyMarkdownHtml } from '../content-editor/legacy'

test('legacy import keeps code text and intentional trailing blanks without the formatter newline', () => {
  const source = '```text\n<tag> &lt;\n\n\n```'
  assert.equal(legacyMarkdownHtml(source, 'markdown'), '<pre><code class="language-text">&lt;tag&gt; &amp;lt;\n\n</code></pre>')
  assert.equal(legacyMarkdownHtml('```unknown\n<raw>\n\nlast', 'markdown'), '<pre><code class="language-unknown">&lt;raw&gt;\n\nlast</code></pre>')
})

test('case Markdown keeps inline code, unknown fences and HTML as text with a copy control', () => {
  const html = renderToStaticMarkup(<ReactMarkdown components={{ pre: CaseCodeBlock }}>{'Inline `code`\n\n```unknown\n<script>literal()</script> &lt;\n\n```'}</ReactMarkdown>)
  assert.match(html, /Inline <code>code<\/code>/)
  assert.match(html, /aria-label="复制代码"/)
  assert.match(html, /language-unknown/)
  assert.match(html, /&lt;script&gt;literal\(\)&lt;\/script&gt; &amp;lt;\n<\/code>/)
  assert.doesNotMatch(html, /<script>/)
})
