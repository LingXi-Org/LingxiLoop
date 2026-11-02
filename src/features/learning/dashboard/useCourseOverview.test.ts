import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { LearningSpace } from '../contracts'

let slots: unknown[] = [], cursor = 0
let effect: (() => undefined | (() => void)) | undefined
mock.module('react', { namedExports: {
  useState: (initial: unknown) => {
    const index = cursor++
    if (index >= slots.length) slots.push(initial)
    return [slots[index], (value: unknown) => { slots[index] = value }]
  },
  useEffect: (next: () => undefined | (() => void)) => { effect = next },
} })

const calls: string[] = []
const homework = { id: 'homework', targetType: 'homework', kind: 'assignment' }
const post = { id: 'post', targetType: 'post', kind: 'assignment' }
const detail = { student: { status: 'PASSED', latestSubmission: { id: 'answer' } } }
const learners = [{ learnerId: 'first', status: 'PENDING' }, { learnerId: 'second', status: 'PASSED' }]
const submissions = [{ learnerId: 'first', version: 2, feedback: [{ body: '已反馈' }] }, { learnerId: 'first', version: 1, feedback: [] }]
const members = [{ userId: 'first', role: 'learner' }]
mock.module('../api', { namedExports: { learningApi: {
  getCourse: async () => { calls.push('course'); return { id: 'course' } },
  listCourseMembers: async () => { calls.push('members'); return members },
} } })
mock.module('../forum/api', { namedExports: { forumApi: {
  list: async (_course: string, { offset }: { offset: number }) => {
    calls.push(`forum:${offset}`)
    return { items: offset === 0 ? [homework] : [post], nextOffset: offset === 0 ? 50 : null }
  },
  submissions: async (_course: string, id: string, offset: number) => {
    calls.push(`submissions:${id}:${offset}`)
    return { items: [submissions[offset === 0 ? 0 : 1]], nextOffset: offset === 0 ? 50 : null }
  },
} } })
mock.module('../homework/api', { namedExports: { homeworkApi: {
  detail: async (_course: string, id: string) => { calls.push(`detail:${id}`); return detail },
  overview: async (_course: string, id: string) => { calls.push(`overview:${id}`); return detail },
  learners: async (_course: string, id: string, offset: number) => {
    calls.push(`learners:${id}:${offset}`)
    return { items: [learners[offset === 0 ? 0 : 1]], nextOffset: offset === 0 ? 50 : null }
  },
} } })
const { useCourseOverview } = await import('./useCourseOverview')

async function load(perspective: 'teacher' | 'learner', canManage = false, canReview = false) {
  slots = []; cursor = 0; calls.length = 0
  const space = { courseId: 'course', perspective, canManage, canReview } as LearningSpace
  useCourseOverview(space)
  const cleanup = effect?.()
  await setImmediate()
  cursor = 0
  const result = useCourseOverview(space)
  cleanup?.()
  assert.equal(result.loading, false)
  assert.equal(result.error, '')
  return result.data
}

test('teacher overview loads complete roster pages without unused course or homework bodies', async () => {
  const result = await load('teacher', true, true)
  assert.deepEqual([...calls], ['forum:0', 'members', 'forum:50', 'learners:homework:0', 'learners:homework:50', 'submissions:post:0', 'submissions:post:50'])
  assert.deepEqual(result, {
    items: [homework, post], members,
    homeworks: [{ item: homework, detail: null, learners }],
    submissions: [{ item: post, submission: submissions[0] }],
  })
})

test('teacher without review access does not fetch unused private homework details', async () => {
  const result = await load('teacher')
  assert.deepEqual([...calls], ['forum:0', 'forum:50', 'submissions:post:0', 'submissions:post:50'])
  assert.deepEqual(result?.homeworks, [{ item: homework, detail: null, learners: [] }])
})

test('learner overview retains progress and submissions without reading private learning history', async () => {
  const result = await load('learner')
  assert.deepEqual([...calls], ['forum:0', 'forum:50', 'overview:homework', 'submissions:post:0', 'submissions:post:50'])
  assert.deepEqual(result, {
    items: [homework, post], members: [],
    homeworks: [{ item: homework, detail, learners: [] }],
    submissions: [{ item: post, submission: submissions[0] }],
  })
})
