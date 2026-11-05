import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyMarkdownHtml } from './legacy'
import { pasteContent } from './paste'
import { markdownInput } from './markdown-input'

test('Enter converts opening fences and math delimiters only at a plain paragraph end', () => {
  for (const [source, type, props] of [
    ['```js', 'codeBlock', { language: 'javascript' }],
    ['~~~python', 'codeBlock', { language: 'python' }],
    ['```', 'codeBlock', { language: 'text' }],
    ['$$', 'mathBlock', {}],
    ['\\[', 'mathBlock', {}],
  ] as const) {
    for (const blocked of ['no', 'code', 'selection', 'middle', 'composition']) {
      let result: unknown
      let cursor: unknown
      let popup = { popupOpen: undefined as string | undefined }
      const block = { id: 'test', type: blocked === 'code' ? 'codeBlock' : 'paragraph' }
      const editor = {
        transact: (run: (tr: unknown) => unknown) => run({ selection: { empty: blocked !== 'selection', $from: { parentOffset: blocked === 'middle' ? 1 : source.length, parent: { textContent: source, content: { size: source.length } } } } }),
        getTextCursorPosition: () => ({ block }),
        updateBlock: (_block: unknown, update: unknown) => { result = update },
        setTextCursorPosition: (id: unknown, position: unknown) => { cursor = [id, position] },
        getExtension: () => ({ store: { setState: (update: (state: typeof popup) => typeof popup) => { popup = update(popup) } } }),
      }
      const extension = markdownInput({ editor } as unknown as Parameters<typeof markdownInput>[0])
      const handled = extension.keyboardShortcuts.Enter({ editor, event: { isComposing: blocked === 'composition' } } as unknown as Parameters<typeof extension.keyboardShortcuts.Enter>[0])
      assert.equal(handled, blocked === 'no')
      assert.deepEqual(result, blocked === 'no' ? { type, props, content: [] } : undefined)
      assert.deepEqual(cursor, blocked === 'no' ? [block, 'start'] : undefined)
      assert.equal(popup.popupOpen, blocked === 'no' && type === 'mathBlock' ? block.id : undefined)
    }
  }
})

test('case Markdown imports inline and display math alongside literal fenced code', () => {
  const html = legacyMarkdownHtml('$x^2$\n\n$$\nx^2 + y^2\n$$\n\n```js\nconst x = "$literal$";\n```', 'markdown')
  assert.match(html, /<math[^>]*display="inline"/)
  assert.match(html, /<math[^>]*display="block"/)
  assert.match(html, /<pre><code class="language-js">const x = &quot;\$literal\$&quot;;<\/code><\/pre>/)
})

test('case plain-text math paste uses native MathML import, but code and rich paste stay native', () => {
  for (const [data, inCode, expected] of [
    [{ 'text/plain': '$x^2$' }, false, true],
    [{ 'text/plain': '$$\nx^2\n$$' }, false, true],
    [{ 'text/plain': '$x^2$' }, true, false],
    [{ 'text/plain': '$x^2$', 'text/html': '<b>$x^2$</b>' }, false, false],
    [{ 'text/plain': 'normal text' }, false, false],
  ] as const) {
    let pasted = ''
    const context = {
      event: { clipboardData: { types: Object.keys(data), getData: (key: string) => (data as Record<string, string>)[key] ?? '' } },
      editor: {
        transact: (read: (tr: unknown) => unknown) => read({ selection: { $from: { parent: { type: { spec: { code: inCode } } } }, $to: { parent: { type: { spec: { code: inCode } } } } } }),
        pasteHTML: (html: string) => { pasted = html },
      },
      defaultPasteHandler: () => false,
    }
    pasteContent(context as unknown as Parameters<typeof pasteContent>[0], 'markdown')
    assert.equal(pasted.includes('<math'), expected)
  }
})
