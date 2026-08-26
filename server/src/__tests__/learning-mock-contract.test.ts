import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const router = readFileSync(new URL('../learning/router.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../../../src/api/client.ts', import.meta.url), 'utf8')
const mock = readFileSync(new URL('../../../src/dev/mockLearning.ts', import.meta.url), 'utf8')
const mockIm = readFileSync(new URL('../../../src/dev/mockLearningImFixtures.ts', import.meta.url), 'utf8')

test('local learning preview is intercepted only for the production learning route family', () => {
  assert.match(client, /company\?\.startsWith\('mock-'\) && path\.startsWith\('\/learning\/'\)/)
  assert.doesNotMatch(mock, /\/api\/mock|fake-feature/)
})

test('every mutable learning preview surface has a production route', () => {
  for (const route of [
    '/dashboard', '/courses', '/objectives', '/activities', '/publish', '/close',
    '/submit', '/missions', '/evidence', '/reviews', '/progress',
    '/notification-preferences', '/deliveries',
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
  for (const expected of ['Study Room｜学习室', 'Lab｜实践工坊', '线性代数课程讨论']) {
    assert.ok(mockIm.includes(expected), `${expected} missing`)
  }
  for (const retired of ['产品协作群', '设计评审', '发布作战室', '空白头脑风暴', 'mock-iris', 'mock-echo', 'mock-mica', 'mock-sol', 'mock-kite']) {
    assert.ok(!mockIm.includes(retired), `non-learning fixture leaked into preview: ${retired}`)
  }
})
