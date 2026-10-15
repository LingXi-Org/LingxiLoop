import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalizeMentions, parseMentions, scanMentions } from '../mentions.js'

const targets = [
  { id: 'ann', name: 'Ann' },
  { id: 'anna', name: 'Anna Smith' },
  { id: 'iris-01', name: '小灵' },
  { id: 'human-1', name: 'Alice' },
]

// Failure cases: assistant formatting swallows an assignment; code snippets,
// quoted examples, unknown members or ambiguous names accidentally start work.
test('assistant formatting permits only a complete standalone inline mention', () => {
  const options = { allowInlineCodeMentions: true }
  const text = '- 明理 `@ann` 请介绍自己。\n- 同学 ``＠　Anna   Smith`` 请接着介绍。'
  assert.deepEqual(parseMentions(text, targets, options), { mentionedIds: ['ann', 'anna'], mentionAll: false })
  assert.deepEqual(scanMentions(text, targets, options).map(({ start, end }) => text.slice(start, end)), ['@ann', '＠　Anna   Smith'])
  assert.deepEqual(parseMentions(text, targets), { mentionedIds: [], mentionAll: false }, 'human code examples stay inert')
  assert.equal(parseMentions('请 `@所有人` 回答', targets, options).mentionAll, true)
  const examples = '> `@ann`\n\n[`@anna`](https://example.org)\n\n```text\n@iris-01\n```\n'
    + '`call("@ann")` `@anna please reply` `@ann @anna` `@ann\n` `@missing` `@annex`'
  assert.deepEqual(parseMentions(examples, targets, options), { mentionedIds: [], mentionAll: false })
  assert.deepEqual(parseMentions('`@同名`', [{ id: 'a', name: '同名' }, { id: 'b', name: '同名' }], options).mentionedIds, [])
})

test('parses ids, unique names, unicode names, case and multiple mentions', () => {
  assert.deepEqual(parseMentions('@ANN @Anna Smith 请和@小灵、@iris-01处理', targets), {
    mentionedIds: ['ann', 'anna', 'iris-01'],
    mentionAll: false,
  })
})

test('recognizes standalone @all without prefix collisions', () => {
  assert.deepEqual(parseMentions('@all @alligator @anna', targets), {
    mentionedIds: ['anna'],
    mentionAll: true,
  })
})

test('recognizes native @all next to CJK prose and rejects @everyone', () => {
  assert.equal(parseMentions('请@all 都回答', targets).mentionAll, true)
  assert.equal(parseMentions('@everyone please answer', targets).mentionAll, false)
})

test('ignores emails, URLs, inline code and fenced code', () => {
  const body = 'mail a@ann.com https://x.test/@anna `@iris-01`\n```ts\n@小灵\n```\nreal @human-1'
  assert.deepEqual(parseMentions(body, targets), {
    mentionedIds: ['human-1'],
    mentionAll: false,
  })
})

test('uses token boundaries for prefix-like member ids', () => {
  assert.deepEqual(parseMentions('@ann-x @ann and x@anna', targets), {
    mentionedIds: ['ann'],
    mentionAll: false,
  })
})

test('Chinese prose may immediately follow a unique longest roster name', () => {
  const roster = [{ id: 'sage', name: '明理' }, { id: 'scout', name: '寻知' }, { id: 'long', name: '明理老师' }]
  assert.deepEqual(parseMentions('@明理请解释，请@寻知查资料 @明理老师讲解 @sage讲解', roster), {
    mentionedIds: ['sage', 'scout', 'long'], mentionAll: false,
  })
  assert.deepEqual(parseMentions('@明理请解释', [...roster, { id: 'custom', name: '明理' }]).mentionedIds, [])
  assert.deepEqual(parseMentions('`@明理请解释` https://test/@寻知查资料 a@明理.cn', roster).mentionedIds, [])
})

// Failure cases: normalization shifts UTF-16 offsets, whitespace splits a name,
// adjacent mentions disappear, ambiguous names dispatch, or quoted examples wake agents.
test('shared mention ranges preserve original text across Unicode and whitespace', () => {
  const text = '🙂请＠　ＡＮＮ、@\u00a0Anna   Smith一起处理@iris-01@所有人'
  const mentions = scanMentions(text, targets)
  assert.deepEqual(mentions.map(({ id, start, end }) => [id, text.slice(start, end)]), [
    ['ann', '＠　ＡＮＮ'], ['anna', '@\u00a0Anna   Smith'], ['iris-01', '@iris-01'], ['all', '@所有人'],
  ])
  assert.deepEqual(parseMentions(text, targets), { mentionedIds: ['ann', 'anna', 'iris-01'], mentionAll: true })
})

test('normalizes composed graphemes while preserving their full source ranges', () => {
  const source = '🙂 @Cafe\u0301、＠Ｃａｆé'
  const roster = [{ id: 'cafe', name: 'Café' }]
  assert.deepEqual(scanMentions(source, roster).map(({ id, start, end }) => [id, source.slice(start, end)]), [
    ['cafe', '@Cafe\u0301'], ['cafe', '＠Ｃａｆé'],
  ])
  assert.equal(canonicalizeMentions(source, roster), '🙂 @cafe、@cafe')
})

test('only ordinary message prose can mention a member', () => {
  const text = '> 引用 @ann\n> @iris-01\n\n[@anna](https://example.com) ![@ann](/image.png)\n'
    + '~~~text\n@iris-01\n~~~\n`@ann` mail@ann.cn https://example.com/@anna\n真实 @iris-01'
  assert.deepEqual(parseMentions(text, targets), { mentionedIds: ['iris-01'], mentionAll: false })
  assert.deepEqual(scanMentions('@annex @missing @\nann', targets), [])
  assert.deepEqual(scanMentions('@同 名', [{ id: 'one', name: '同 名' }, { id: 'two', name: '同　名' }]), [])
})

test('canonical storage preserves prose and examples while surviving a member rename', () => {
  const source = '请＠　小灵检查 [@Ann](/example)，再找@Anna   Smith。'
  const canonical = canonicalizeMentions(source, targets)
  assert.equal(canonical, '请@iris-01检查 [@Ann](/example)，再找@anna。')
  assert.deepEqual(parseMentions(canonical, targets.map(target => ({ ...target, name: '改名' }))), {
    mentionedIds: ['iris-01', 'anna'], mentionAll: false,
  })
})
