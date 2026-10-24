import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codeLanguage, contentCodeBlock, pasteCode } from './code-block'
import type { NativeEditor } from './schema'

test('external code fences resolve aliases and unsupported languages at the schema boundary', () => {
  for (const [input, expected] of [['js', 'javascript'], ['PY', 'python'], [' ts ', 'typescript'], ['c++', 'cpp'], ['unknown-language', 'text'], ['', 'text']]) {
    const element = { tagName: 'PRE', childElementCount: 1, firstElementChild: { tagName: 'CODE', className: `language-${input}`, getAttribute: () => input } } as unknown as HTMLElement
    assert.equal(contentCodeBlock.implementation.parse!.call({}, element)?.language, expected)
    assert.equal(codeLanguage(input), expected)
  }
})

test('VS Code input is serialized as literal text, including malformed metadata and code selections', () => {
  const original = '<tag>&lt;</code><script>literal</script>\r\n\t  tail  '
  for (const metadata of ['{"mode":"html"}', '{invalid']) {
    let serialized: unknown
    const editor = {
      transact: () => false,
      blocksToFullHTML: (blocks: unknown) => { serialized = blocks; return 'upstream-escaped-html' },
      pasteHTML: (html: string, raw: boolean) => { assert.equal(html, 'upstream-escaped-html'); assert.equal(raw, true) },
    } as unknown as NativeEditor
    const event = { clipboardData: { getData: (type: string) => ({ 'vscode-editor-data': metadata, 'text/plain': original })[type] ?? '' } } as ClipboardEvent
    assert.equal(pasteCode({ event, editor, defaultPasteHandler: () => assert.fail('unsafe VS Code path') }), true)
    assert.deepEqual(serialized, [{ type: 'codeBlock', props: { language: metadata.startsWith('{"') ? 'html' : 'text' }, content: original.replace(/\r\n/g, '\n') }])
    editor.transact = (() => true) as NativeEditor['transact']
    let delegated = false
    pasteCode({ event, editor, defaultPasteHandler: () => { delegated = true; return true } })
    assert.equal(delegated, true, 'existing code selections retain the native plain-text paste behavior')
  }
})
