import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalMessageMentions, parseMentions } from '../mentions.js'
import { createNativeMessage, nativeText, type NativeMessage } from '../im/message-types.js'
import { answerSegment } from '../../../src/lib/answerSegment.js'

const roster = [{ id: 'sage', name: '明理' }, { id: 'milo', name: '砺思' }, { id: 'nova', name: '司南' }]
function answer(text: string, start: number, index: number) {
  return { type: 'text' as const, text, providerMetadata: { lingxiloop: {
    answerSegment: { version: 3, messageId: 'synthetic-answer', segmentId: `segment-${index}`, partId: `part-${index}`, start, end: start + text.length },
  } } }
}
const process = { type: 'text' as const, text: '公开检索进度 @milo', providerMetadata: { lingxiloop: {
  activity: { version: 1, id: 'synthetic-process', label: '公开进度', kind: 'commentary' },
} } }
function fixture(texts: string[], progress = false): NativeMessage {
  let start = 0
  const content = texts.map((text, index) => { const part = answer(text, start, index); start += text.length; return part })
  return createNativeMessage({ id: 'synthetic-mentions', role: 'assistant', content: progress ? [process, ...content] : content })
}

// The original admission loop inserts an offset after every text part. Native
// v3 joins contiguous answer slices without that offset and excludes process.
for (const progress of [false, true]) for (const texts of [
  ['第一段。\n\n', '成员 @milo / @sage / @nova。'],
  ['🙂中文 @sage。\n', '| 成员 | 分工 |\n| @milo | 核对 |\n', '中文紧邻@sage检查、＠　司南核对。'],
  ['第一段。', '@明理请核对。[证据](#cite-S1)', '\n@砺思检查。'],
  ['检查 @sa', 'ge 和 @明', '理的出处。'],
]) test(`admission preserves contiguous answer slices (process=${progress}, parts=${JSON.stringify(texts)})`, () => {
  const message = fixture(texts, progress), source = texts.join('')
  const expected = source.replaceAll('＠　司南', '@nova').replaceAll('@明理', '@sage').replaceAll('@砺思', '@milo')
  const result = canonicalMessageMentions(message, roster)
  assert.equal(nativeText(message), source)
  assert.equal(nativeText(result), expected)
  assert.deepEqual(canonicalMessageMentions(result, roster), result, 'canonicalization is idempotent')
  if (progress) assert.deepEqual(result.content[0], process, 'process text stays outside body transformations')
  assert.deepEqual(parseMentions(nativeText(result), roster), parseMentions(expected, roster))
  for (const part of result.content) if (part.type === 'text' && part !== process && part.providerMetadata?.lingxiloop?.answerSegment) {
    const segment = answerSegment(part)
    assert.ok(segment, 'rewritten source ranges must remain valid')
    assert.equal(nativeText(result).slice(segment.start, segment.end), part.text)
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'history/receipt JSON roundtrip keeps text and identities')
})

test('legacy separators and citation ranges share the exact transformed text coordinates', () => {
  for (const v3 of [true, false]) {
    const texts = ['请@明理核对。', '🙂 [出处](#cite-S1) @砺思检查。']
    const content = v3 ? fixture(texts).content : texts.map(text => ({ type: 'text' as const, text }))
    const source = nativeText({ content }), start = source.indexOf('['), end = source.indexOf(')') + 1
    const message = createNativeMessage({ id: 'synthetic-citation', role: 'assistant', content: [...content,
      { type: 'data', name: 'citation-claims', data: { claims: [{ start, end, text: '出处', markers: ['S1'] }] } }] })
    const result = canonicalMessageMentions(message, roster)
    const citations = result.content.find(part => part.type === 'data' && part.name === 'citation-claims')!
    assert.equal(citations.type, 'data')
    if (citations.type !== 'data') throw new Error('citation missing')
    const claim = (citations.data as { claims: { start: number; end: number }[] }).claims[0]
    assert.equal(nativeText(result).slice(claim.start, claim.end), '[出处](#cite-S1)')
    assert.equal(nativeText(result), texts.join(v3 ? '' : '\n').replaceAll('@明理', '@sage').replaceAll('@砺思', '@milo'))
  }
})

test('unknown and prefix-like handles cannot be repaired into authorized peers', () => {
  const message = fixture(['🙂 @sagee ', '@unknown @milolo @nova-suffix'])
  assert.deepEqual(canonicalMessageMentions(message, roster), message)
  assert.deepEqual(parseMentions(nativeText(message), roster).mentionedIds, [])
})
