import assert from 'node:assert/strict'
import test from 'node:test'
import { conversationHandoffMentions } from '../agent-runtime/conversation-handoff.js'

const roster = [{id:'nova',name:'司南',kind:'agent' as const},{id:'sage',name:'明理',kind:'agent' as const},{id:'human',name:'同学',kind:'human' as const}]
test('only an explicit public handoff line dispatches; roster descriptions and history remain inert', () => {
  for(const text of ['成员：@明理负责核对。','| @sage | 核对 |','@sage 请核对。','之前 @sage 已经核对。',
    '> 协作交接：@sage 请核对。','```text\n协作交接：@sage 请核对。\n```','协作交接：`@sage` 请核对。',
    '协作交接：@all 大家处理。','协作交接：@nova 自己处理。','协作交接：@human 请处理。','协作交接：@sage',
    '协作交接：@sagee 请核对。']) assert.deepEqual(conversationHandoffMentions(text,roster,'nova'),[],text)
  assert.deepEqual(conversationHandoffMentions('成员 @nova、@明理。\n\n协作交接：@明理 请核对证据并报告结论。',roster,'nova'),['sage'])
  assert.deepEqual(conversationHandoffMentions('协作交接：@sage 请核对。\n协作交接：@明理 请报告。',roster,'nova'),['sage'])
  assert.deepEqual(conversationHandoffMentions('协作交接：@同名 请核对。',[{id:'one',name:'同名'},{id:'two',name:'同名'}],'nova'),[])
})
