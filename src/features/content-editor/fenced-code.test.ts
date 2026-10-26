import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recoverFencedCode } from './fenced-code'
import type { ContentDocument } from './document'
import type { ContentBlock } from './schema'

const paragraph = (text: string, id = text): Extract<ContentBlock, { type: 'paragraph' }> => ({ id, type: 'paragraph', props: { textAlignment: 'left', textColor: 'default', backgroundColor: 'default' }, content: [{ type: 'text', text, styles: {} }], children: [] })
const source = '```python\ndef hello():\n    print("<script> &lt;")\n\n    return 1  \n```'
const code = 'def hello():\n    print("<script> &lt;")\n\n    return 1  '
const nativeCode = (): ContentBlock[] => [{ id: 'parsed', type: 'codeBlock', props: { language: 'python' }, content: [{ type: 'text', text: code, styles: {} }], children: [] }]
const doc = (blocks: ContentBlock[], projection = source): ContentDocument => ({ format: 'blocknote', version: 1, blocks, projection, sections: [], legacyMarkdown: source })

test('repairs only exact fenced source in plain paragraph runs and retains other native blocks', () => {
  for (const paragraphs of [[paragraph(source)], source.split('\n').map((line, i) => paragraph(line, `line-${i}`))]) {
    const image = { id: 'asset', type: 'image', props: { url: '/kept' }, children: [] } as unknown as ContentBlock
    const original = doc([image, ...paragraphs])
    const repaired = recoverFencedCode(original, source, snippet => { assert.equal(snippet, source); return nativeCode() })
    assert.notEqual(repaired, original)
    assert.equal(repaired.blocks[0], image)
    assert.equal(repaired.blocks[1].id, paragraphs[0].id)
    assert.equal(repaired.blocks[1].type, 'codeBlock')
    assert.equal(repaired.legacyMarkdown, source)
    assert.equal(recoverFencedCode(repaired, source, () => assert.fail('second conversion')), repaired)
  }
})

test('does not reinterpret escaped prose, stale original Markdown, styled text or incomplete fences', () => {
  const styled = paragraph(source); styled.content[0] = { type: 'text', text: source, styles: { code: true } }
  for (const original of [
    doc([paragraph(source)], source.replaceAll('`', '\\`')),
    doc([paragraph('ordinary text')]),
    doc([styled]),
    doc([paragraph(source.slice(0, -4))], source.slice(0, -4)),
    doc([paragraph('Use ```python as literal text')], 'Use ```python as literal text'),
  ]) assert.equal(recoverFencedCode(original, original.projection, () => assert.fail('ambiguous conversion')), original)
  const original = doc([paragraph(source)])
  assert.equal(recoverFencedCode(original, 'different body', () => assert.fail('stale projection')), original)
})

test('refuses an import that changes code text, and preserves unrelated fenced native blocks', () => {
  const original = doc([paragraph(source)])
  const changed = nativeCode(); changed[0] = { ...changed[0], content: [{ type: 'text', text: code.trimEnd(), styles: {} }] } as ContentBlock
  assert.equal(recoverFencedCode(original, source, () => changed), original)
  const native = doc(nativeCode())
  assert.equal(recoverFencedCode(native, source, () => assert.fail('native is canonical')), native)
  const ambiguous = doc([paragraph(source, 'first'), paragraph(source, 'literal')])
  assert.equal(recoverFencedCode(ambiguous, source, () => assert.fail('ambiguous duplicate')), ambiguous)
  const mixed = doc([...nativeCode(), paragraph(source, 'literal')])
  assert.equal(recoverFencedCode(mixed, source, () => assert.fail('native already represents source')), mixed)
})
