import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NativeEditor } from './schema'
import { pasteContent } from './paste'

const event = (data: Record<string, string>) => ({ clipboardData: { types: Object.keys(data), getData: (type: string) => data[type] ?? '' } }) as unknown as ClipboardEvent

test('forum Markdown paste uses the existing currency-safe math import and keeps code literal', () => {
  let html = ''
  const editor = { transact: () => false, pasteHTML: (value: string, raw: boolean) => { html = value; assert.equal(raw,true) } } as unknown as NativeEditor
  const source = 'Inline $x^2$\n\n$$\nS=bh/2\n$$\n\nPrice $5 and $3.\n\n~~~js\nconst source = "$x$";\n~~~'
  const clipboard = event({ 'text/plain': source })
  assert.equal(pasteContent({event:clipboard,editor,defaultPasteHandler:()=>assert.fail('missing math adaptation')}, 'forum'),true)
  assert.match(html, /<math[^>]*display="inline"/)
  assert.match(html, /<math[^>]*display="block"/)
  assert.match(html, /Price \$5 and \$3\./)
  assert.match(html, /<code class="language-js">const source = &quot;\$x\$&quot;;<\/code>/)
})

test('native, rich HTML, file, code and case clipboard paths retain their existing handling', () => {
  const delegatedClipboard: Record<string, string>[] = [{ 'blocknote/html':'native','text/plain':'$x$' }, { 'text/html':'<p>rich</p>','text/plain':'$x$' }, { Files:'file','text/plain':'$x$' }, { 'text/plain':'ordinary text' }, { 'text/plain':'`$x$`' }]
  for (const data of delegatedClipboard) {
    let delegated=0
    const editor = { transact:()=>false, pasteHTML:()=>assert.fail('unexpected conversion') } as unknown as NativeEditor
    pasteContent({event:event(data),editor,defaultPasteHandler:()=>{delegated++;return true}},'forum')
    assert.equal(delegated,1)
  }
  for (const [inCode,format] of [[true,'forum'],[false,'markdown']] as const) {
    let delegated=0
    pasteContent({event:event({'text/plain':'$x$'}),editor:{transact:()=>inCode} as unknown as NativeEditor,defaultPasteHandler:()=>{delegated++;return true}},format)
    assert.equal(delegated,1)
  }
})

test('case Markdown code paste reuses legacy import and preserves terminal blanks and literal HTML', () => {
  let html = ''
  const editor = { transact: () => false, pasteHTML: (value: string, raw: boolean) => { html = value; assert.equal(raw, true) } } as unknown as NativeEditor
  const source = 'Before `inline`\n\n````unknown\n<script>literal</script> &lt;\n\t  tail  \n\n\n````'
  assert.equal(pasteContent({ event: event({ 'text/plain': source }), editor, defaultPasteHandler: () => assert.fail('code must use common import') }, 'markdown'), true)
  assert.match(html, /<p>Before <code>inline<\/code><\/p>/)
  assert.match(html, /<code class="language-unknown">&lt;script&gt;literal&lt;\/script&gt; &amp;lt;\n\t  tail  \n\n<\/code>/)
  assert.doesNotMatch(html, /<script>/)
})
