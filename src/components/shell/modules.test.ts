import assert from 'node:assert/strict'
import test from 'node:test'
import { courseEntryView, moduleForView, rememberCourseView } from './modules'

test('every URL view keeps a module, and course pages share one nested sidebar', () => {
  assert.equal(moduleForView('conversations'), 'chat')
  assert.equal(moduleForView('slides'), 'slides')
  for (const view of ['learning', 'forum', 'course-materials', 'cases', 'courses', 'course-members', 'course-status'] as const)
    assert.equal(moduleForView(view), 'course', view)
})

test('the course rail entry returns to the last course page, falling back to cases without a course', () => {
  assert.equal(courseEntryView(true), 'learning')
  assert.equal(courseEntryView(false), 'cases')
  rememberCourseView('forum')
  assert.equal(courseEntryView(true), 'forum')
  assert.equal(courseEntryView(false), 'cases')
  rememberCourseView('conversations')
  assert.equal(courseEntryView(true), 'forum')
  rememberCourseView('cases')
  assert.equal(courseEntryView(false), 'cases')
})
