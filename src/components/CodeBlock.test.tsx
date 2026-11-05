import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { ThemeProvider } from 'next-themes'
import { CodeBlock } from './CodeBlock'

test('the open-source component preserves escaped source and supplies copy/download controls', () => {
  const source = 'const text = "<script>alert(1)</script>"\n第二行'
  const $ = load(renderToStaticMarkup(<CodeBlock language="js" codeContent={source} />))
  assert.equal($('pre code').text(), source)
  assert.equal($('pre code.language-javascript').length, 1)
  assert.equal($('script').length, 0)
  assert.equal($('[aria-label="复制代码"]').length, 1)
  assert.equal($('[aria-label="下载代码"]').length, 1)
})

test('unknown languages remain readable and both modes use the canonical code font', () => {
  for (const theme of ['light', 'dark']) {
    const $ = load(renderToStaticMarkup(<ThemeProvider forcedTheme={theme}><CodeBlock language="unknown-language" codeContent="原样保留" /></ThemeProvider>))
    assert.equal($('pre code').text(), '原样保留')
    assert.match($('pre').attr('style') ?? '', /font-family:var\(--font-mono\)/)
  }
})
