import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const router = readFileSync(new URL('../learning/router.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../../../src/api/client.ts', import.meta.url), 'utf8')
const mock = readFileSync(new URL('../../../src/dev/mockLearning.ts', import.meta.url), 'utf8')
const mockIm = readFileSync(new URL('../../../src/dev/mockLearningImFixtures.ts', import.meta.url), 'utf8')

test('local learning preview is intercepted only for the production learning route family', () => {
  assert.match(client, /company\?\.startsWith\('mock-'\) && \(path\.startsWith\('\/learning\/'\) \|\| path\.startsWith\('\/im\/approvals\/'\)\)/)
  assert.doesNotMatch(mock, /\/api\/mock|fake-feature/)
})

test('every mutable learning preview surface has a production route', () => {
  for (const route of [
    '/dashboard', '/courses', '/objectives', '/activities', '/publish', '/close',
    '/submit', '/missions', '/evidence', '/reviews', '/progress',
    '/notification-preferences', '/deliveries', '/teacher-agent',
  ]) {
    assert.ok(router.includes(route), `production learning router missing ${route}`)
  }
  for (const operation of ['publishLearningActivity', 'closeLearningActivity', 'submitLearningActivity', 'reviewLearningEvaluation']) {
    assert.ok(client.includes(operation), `production API client missing ${operation}`)
  }
})

test('learning demo agents preserve the one-tool production invariant', () => {
  assert.match(mockIm, /const capabilityByAgent:[^=]+=/)
  assert.match(mockIm, /nova:\['canvas','knowledge','learning'\]/)
  for (const name of ['mock-nova', 'mock-sage', 'mock-milo', 'mock-trace', 'mock-scout', 'mock-forge']) {
    const start = mockIm.indexOf(`id: '${name}'`)
    assert.ok(start >= 0, `${name} missing`)
    const block = mockIm.slice(start, start + 700)
    assert.match(block, /tools: \['ipython'\]/)
    assert.match(block, /capabilities/)
  }
})

test('local preview contains only learning-product conversations and agents', () => {
  for (const expected of ['学习室｜线性代数', '实践工坊｜迁移项目', '线性代数课程讨论','教师室｜线性代数','Pulse · 研究实验室']) {
    assert.ok(mockIm.includes(expected), `${expected} missing`)
  }
  for (const retired of ['产品协作群', '设计评审', '发布作战室', '空白头脑风暴', 'mock-iris', 'mock-echo', 'mock-mica', 'mock-sol', 'mock-kite']) {
    assert.ok(!mockIm.includes(retired), `non-learning fixture leaked into preview: ${retired}`)
  }
})

test('Pulse preview uses only production teacher-room, aggregate, drill-down and approval contracts',()=>{
  assert.match(mockIm,/capabilities:\['teacher_admin'\],managed:true/)
  assert.match(mockIm,/没有读取原始作答/)
  assert.match(mockIm,/写入证据访问审计/)
  assert.match(mockIm,/定时摘要已直接配置完成/)
  assert.match(mockIm,/活动草稿已保存/)
  assert.match(mockIm,/kind:'approval'/)
  assert.match(mockIm,/kind:'course_management'/)
  assert.match(mock,/parts\[3\]==='teacher-agent'/)
  assert.match(mock,/parts\[0\]==='im'.*parts\[1\]==='approvals'/)
})

test('learning preview copy is natural Chinese while product names and durable enum values stay intact',()=>{
  for(const unfriendly of ['Teacher Operations','Mission task board','Mission coordinators','Project 共用','pending teacher review','due_review（','needs_review（','paused_mission（']){
    assert.ok(!mockIm.includes(unfriendly),`unfriendly mixed-language copy leaked into preview: ${unfriendly}`)
  }
  assert.match(mockIm,/持续学习任务/)
  assert.match(mockIm,/教师审核/)
})
