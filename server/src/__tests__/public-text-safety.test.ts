import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { closeDatabasePools } from '../db/pool.js'
import { redis, sub } from '../redis.js'
after(async () => { redis.disconnect(); sub.disconnect(); await closeDatabasePools() })

type Input = { text: string; isFinal: boolean; approvedThrough: number }
type Decision = { safeThrough: number; reject?: 'unsafe_content' | 'unsupported_content' }
const policy = new ProductRuntimePolicy()
// Baseline has no gate and publishes all declared user text. Keep that behavior
// explicit so the red demonstrates a disclosure rather than a missing import.
const hook = Reflect.get(policy,'publicTextSafety') as ((input: Input, context: unknown) => Decision) | undefined
function check(input: Input) { return hook ? hook.call(policy,input,{}) : { safeThrough: input.text.length } }
function publish(chunks: string[], final = true) {
  let text = '', publicText = '', approvedThrough = 0, rejected = false
  for (const chunk of chunks) {
    text += chunk
    const result = check({ text,isFinal: false,approvedThrough })
    assert.ok(Number.isInteger(result.safeThrough) && result.safeThrough >= approvedThrough && result.safeThrough <= text.length)
    if (result.reject) { rejected = true; break }
    publicText += text.slice(approvedThrough,result.safeThrough); approvedThrough = result.safeThrough
  }
  if (final && !rejected) {
    const result = check({ text,isFinal: true,approvedThrough })
    if (result.reject) rejected = true
    else { publicText += text.slice(approvedThrough,result.safeThrough); approvedThrough = result.safeThrough }
  }
  return { text,publicText,rejected,approvedThrough }
}

test('cumulative gate rejects every chunk split and every-character reasoning/protocol marker without leaking its content', () => {
  for (const marker of ['<think>','<analysis>','<system>','<|im_start|>','<|channel|>']) {
    const value = `I will inspect the files.\n${marker}PRIVATE_STREAM_SENTINEL`
    for (let cut = 1; cut < value.length; cut++) {
      const result = publish([value.slice(0,cut),value.slice(cut)])
      assert.doesNotMatch(result.publicText,/PRIVATE_STREAM_SENTINEL|<think|<analysis|<system|<\|/)
      assert.equal(result.rejected,true)
    }
    assert.doesNotMatch(publish([...value]).publicText,/PRIVATE_STREAM_SENTINEL|<think|<analysis|<system|<\|/)
  }
})

test('normal prose publishes immediately but an unfinished marker never flushes at EOF or interrupted delivery', () => {
  const safe = 'I will inspect the available files. 😀'
  assert.equal(publish([safe],false).publicText,safe)
  for (const suffix of ['<','<th','<think','<|','`unfinished <think>PRIVATE_STREAM_SENTINEL']) {
    for (const final of [true,false]) assert.equal(publish([safe,suffix],final).publicText,safe)
  }
})

test('multiple planning directives are held cumulatively before a later cluster can reject them', () => {
  for (const value of ['Let me think about this. The user wants an explanation. Let me write this in Chinese.',
    '我的角色是协调者。让我组织讲解。让我先理清逻辑。写最终回答。']) {
    const result = publish([...value]); assert.equal(result.rejected,true); assert.equal(result.publicText,'')
  }
  const legitimate = 'Let me write a small example.'
  assert.equal(publish([legitimate],false).publicText,'')
  assert.equal(publish([legitimate]).publicText,legitimate)
})

test('fenced code, inline code, blockquotes and ordinary vocabulary remain exact quoted data for every character', () => {
  for (const value of ['```xml\n<think>PRIVATE_STREAM_SENTINEL</think>\n```\nExplanation.',
    '```xml\n<system>PRIVATE_STREAM_SENTINEL</system>\n```', '> <system>PRIVATE_STREAM_SENTINEL</system>', '`<system>PRIVATE_STREAM_SENTINEL</system>`',
    '~~~xml\n<|channel|>PRIVATE_STREAM_SENTINEL\n~~~\nExplanation.',
    '> <think>PRIVATE_STREAM_SENTINEL</think>\n> Let me think. The user wants this. Let me write it.\n\nExplanation.',
    'Use `<think>PRIVATE_STREAM_SENTINEL</think>` as an example.',
    '我认为需要先思考边界条件，再解释这个公式。', 'The word is the', 'Use 1 < 2 and a 😀 icon.']) {
    const result = publish([...value]); assert.equal(result.rejected,false,value); assert.equal(result.publicText,value)
  }
})

test('leaving quoted data cannot cause later unquoted protocol markers to bypass the gate', () => {
  for (const quote of ['```text\nsafe example\n```\n','> safe example\n','`safe example` ']) {
    const result = publish([quote,'<th','ink>PRIVATE_STREAM_SENTINEL'])
    assert.equal(result.rejected,true); assert.doesNotMatch(result.publicText,/PRIVATE_STREAM_SENTINEL|<think/)
  }
})

test('approval holds a trailing high surrogate until the pair arrives', () => {
  const first = check({ text: 'Safe \ud83d',isFinal: false,approvedThrough: 0 })
  assert.equal(first.safeThrough,5)
  const second = check({ text: 'Safe 😀',isFinal: false,approvedThrough: first.safeThrough })
  assert.equal(second.safeThrough,7)
})

test('long cumulative streams pause optional publication work while a single final safety check accepts the complete answer', () => {
  const text = 'Ordinary settled content. '.repeat(1000)
  assert.equal(check({ text,isFinal: false,approvedThrough: 4096 }).safeThrough,4096)
  assert.equal(check({ text,isFinal: true,approvedThrough: 4096 }).safeThrough,text.length)
  assert.equal(check({ text: `${text}\n<think>PRIVATE_STREAM_SENTINEL</think>`,isFinal: true,approvedThrough: 4096 }).reject,'unsafe_content')
})
