import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentRequestSchema, updateAgentRequestSchema } from '../modules/agents/contracts.js'

test('new and changed Agent display names require explicit Chinese; unrelated legacy edits stay compatible', () => {
  const input = {name:'新的助教',systemPrompt:'负责检查合成测试里的来源和证据。'}
  assert.equal(createAgentRequestSchema.safeParse(input).success,true)
  for (const name of ['English Helper','明理English','助教1','']) {
    assert.equal(createAgentRequestSchema.safeParse({...input,name}).success,false)
    assert.equal(updateAgentRequestSchema.safeParse({name}).success,false)
  }
  assert.equal(updateAgentRequestSchema.safeParse({bio:'更新说明，保留旧身份。'}).success,true)
  assert.equal(updateAgentRequestSchema.safeParse({name:'明理'}).success,true)
})
