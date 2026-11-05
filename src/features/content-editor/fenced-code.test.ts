import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recoverFencedCode } from './fenced-code'
import type { ContentDocument } from './document'
import type { ContentBlock } from './schema'

const parts = ['```\nimport x\nfrom x import y\nx = 1\ny = 2', '', 'if x:\n    print(y)', '', 'print(x)', '```']
const source = parts.join('\n')
const document = (italic: boolean): ContentDocument => ({
  format: 'blocknote', version: 1, projection: source, sections: [source],
  blocks: parts.map((text, index) => ({ id: `p${index}`, type: 'paragraph',
    props: { textAlignment: 'left', textColor: 'default', backgroundColor: 'default' }, children: [],
    content: [{ type: 'text', text, styles: italic && index === 2 ? { italic: true } : {} }],
  })),
})

test('six-paragraph unlabelled fence recovers exact code only when native text has no authored style', () => {
  const original = document(false)
  const code = source.slice(4, -4)
  const result = recoverFencedCode(original, source, () => [{ id: 'parsed', type: 'codeBlock',
    props: { language: 'text' }, content: [{ type: 'text', text: code, styles: {} }], children: [],
  } as ContentBlock])
  assert.equal(result.blocks.length, 1)
  assert.equal(result.blocks[0].type, 'codeBlock')
  assert.equal(result.blocks[0].id, 'p0')
  assert.equal(result.projection, source)
  assert.equal(recoverFencedCode(result, source, () => assert.fail('idempotent')), result)
})

test('six-paragraph styled or escaped source remains intact instead of losing italic content', () => {
  const styled = document(true)
  const snapshot = JSON.stringify(styled)
  assert.equal(recoverFencedCode(styled, source, () => assert.fail('styled source must not convert')), styled)
  assert.equal(JSON.stringify(styled), snapshot)
  const escaped = { ...document(false), projection: source.replaceAll('`', '\\`') }
  assert.equal(recoverFencedCode(escaped, escaped.projection, () => assert.fail('literal source must not convert')), escaped)
})
