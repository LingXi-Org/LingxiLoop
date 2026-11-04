import assert from 'node:assert/strict'
import test from 'node:test'
import { courseEntryView, moduleForView, rememberCourseView } from './modules'

test('cases have an independent module while course pages share their sidebar', () => {
  assert.equal(moduleForView('conversations'), 'chat')
  assert.equal(moduleForView('slides'), 'slides')
  assert.equal(moduleForView('cases'), 'cases')
  for (const view of ['learning', 'forum', 'course-materials', 'courses', 'course-members', 'course-status'] as const)
    assert.equal(moduleForView(view), 'course', view)
})

test('the course entry never falls back to cases or remembers a case visit', () => {
  assert.equal(courseEntryView(true), 'learning')
  assert.equal(courseEntryView(false), 'learning')
  rememberCourseView('forum')
  assert.equal(courseEntryView(true), 'forum')
  assert.equal(courseEntryView(false), 'learning')
  rememberCourseView('conversations')
  assert.equal(courseEntryView(true), 'forum')
  rememberCourseView('cases')
  assert.equal(courseEntryView(true), 'forum')
  assert.equal(courseEntryView(false), 'learning')
})
