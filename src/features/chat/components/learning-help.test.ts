import assert from 'node:assert/strict'
import test from 'node:test'
import { appendLearningHelp, LEARNING_HELP } from './learning-help'

test('selecting help preserves a student attempt and adds only the requested guidance', () => {
  const attempt = '我把网络分成两个子网。\n  我的计算：/26  '
  assert.equal(appendLearningHelp(attempt, 'check'), `${attempt}\n\n${LEARNING_HELP[2].prompt}`)
  assert.equal(appendLearningHelp('  ', 'hint'), LEARNING_HELP[0].prompt)
  assert.match(appendLearningHelp('', 'explain'), /独立尝试/)
  for (const item of LEARNING_HELP) assert.doesNotMatch(item.prompt, /effort|reasoningEffort|掌握|MASTERED/)
})
