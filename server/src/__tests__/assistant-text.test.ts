import assert from 'node:assert/strict'
import test from 'node:test'
import { assistantTextViolation } from '../agent-runtime/assistant-text.js'

test('rejects protocol leakage and repeated paragraphs without clipping normal reasoning vocabulary', () => {
  assert.ok(assistantTextViolation('<think>private deliberation</think>Answer'))
  assert.ok(assistantTextViolation('<|channel|>analysis'))
  assert.ok(assistantTextViolation('Let me think about this. The user wants an explanation. Let me write this in Chinese.'))
  assert.ok(assistantTextViolation('我的角色是协调者。让我组织讲解。让我先理清逻辑。写最终回答。'))
  assert.ok(assistantTextViolation('我应该回复学生。我要回答这个问题。最终中文回复如下。'))
  assert.equal(assistantTextViolation('> Let me think about this. The user wants an explanation. Let me write this.\n\n这段文本包含自述。'),null)
  assert.ok(assistantTextViolation(Array(4).fill('结束。done。').join('\n\n')))
  assert.equal(assistantTextViolation(['定义','例子','推导','条件','误区'].join('\n\n---\n\n')),null)
  for (const text of ['我认为需要先思考边界条件，再解释这个公式。', '先解释 Wi-Fi 接入，再讨论 TCP 和 IP 的分工。', '```xml\n<think>protocol example</think>\n```']) assert.equal(assistantTextViolation(text), null)
})
