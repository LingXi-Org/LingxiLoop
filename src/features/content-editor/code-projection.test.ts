import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { preserveCodeNewlines } from './document'
import { legacyMarkdownHtml } from './legacy'
import { importLegacy } from './legacy'
import type { ContentBlock, NativeEditor } from './schema'

const block = (text: string): ContentBlock => ({ id: 'code', type: 'codeBlock', props: { language: 'text' }, content: [{ type: 'text', text, styles: {} }], children: [] })

test('restores the upstream exporter terminal LF loss without altering code or fence language', () => {
  for (const code of ['\t  indented  \n', '<script>literal</script> &lt;\n\n', '```inside```\n\n\n', '\n']) {
    // Exact output of 0.56 htmlToMarkdown.serializeCodeBlock: slice(0, -1).
    const lossy = `\`\`\`\`text\n${code.slice(0, -1)}\n\`\`\`\`\n`
    const restored = preserveCodeNewlines(lossy, [block(code)])
    const node = fromMarkdown(restored).children[0]
    assert.equal(node.type, 'code')
    if (node.type === 'code') { assert.equal(node.value, code); assert.equal(node.lang, 'text') }
    assert.equal(preserveCodeNewlines(restored, [block(code)]), restored)
    const html = legacyMarkdownHtml(restored, 'markdown')
    assert.ok(!html.includes('<script>'))
    let imported = ''
    importLegacy({ tryParseHTMLToBlocks: (value: string) => { imported = value; return [] } } as unknown as NativeEditor, restored, 'markdown')
    assert.equal(imported, html, 'repair and normal legacy imports share the existing upstream boundary')
  }
})

test('retains already-correct exports, plain code and unmatched mixed native exports', () => {
  const correct = '~~~text\ntrailing\n\n~~~\n'
  assert.equal(preserveCodeNewlines(correct, [block('trailing\n')]), correct)
  const ordinary = '```text\nplain\n```\n'
  assert.equal(preserveCodeNewlines(ordinary, [block('plain')]), ordinary)
  assert.equal(preserveCodeNewlines(ordinary, [block('different\n')]), ordinary)
  assert.equal(preserveCodeNewlines(ordinary + ordinary, [block('plain\n')]), ordinary + ordinary)
})
