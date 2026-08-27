import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DEEPSEEK_API_KEY ||= 'test-key'
const { LEARNING_PRESET_VERSION, STARTER_ROOMS, STARTER_TEAM } = await import('../onboardCompany.js')

test('learning preset defines exactly the six required personas', () => {
  assert.equal(LEARNING_PRESET_VERSION, 8)
  assert.deepEqual(
    STARTER_TEAM.map((agent) => agent.presetKey),
    ['nova', 'sage', 'milo', 'trace', 'scout', 'forge'],
  )
  assert.deepEqual(
    STARTER_TEAM.map((agent) => agent.role),
    [
      '学习规划与协调',
      '概念导师',
      '解题陪练',
      '错因诊断与证据复核',
      '阅读与资料研究',
      '实践与项目导师',
    ],
  )
  for (const agent of STARTER_TEAM) {
    assert.deepEqual(agent.tools, ['ipython'])
    assert.ok(agent.capabilities.includes('learning'))
    assert.doesNotMatch(agent.systemPrompt, /loop\.(learning|canvas)/)
    assert.match(agent.systemPrompt, /specialist|coordinator|verifier/i)
    assert.equal('avatarUrl' in agent, false)
  }
})

test('learning preset exposes only Study Room and Lab with fixed members', () => {
  assert.equal(STARTER_ROOMS.length, 2)
  assert.deepEqual(STARTER_ROOMS.map((room) => room.title), [
    '学习室',
    '实践工坊',
  ])
  assert.deepEqual(STARTER_ROOMS[0]?.agentKeys, ['nova', 'sage', 'milo', 'trace'])
  assert.equal(STARTER_ROOMS[0]?.welcomeAuthorKey, 'nova')
  assert.deepEqual(STARTER_ROOMS[1]?.agentKeys, ['forge', 'scout', 'sage'])
  assert.equal(STARTER_ROOMS[1]?.welcomeAuthorKey, 'forge')
  assert.match(STARTER_ROOMS[0]?.welcome ?? '', /复习计划/)
  assert.match(STARTER_ROOMS[1]?.welcome ?? '', /论文|代码|实验/)
})
