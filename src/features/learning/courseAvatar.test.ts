import assert from 'node:assert/strict'
import test from 'node:test'
import { getCourseAvatarUrl } from './courseAvatar'

test('generates a stable local avatar for each course', () => {
  const avatar = getCourseAvatarUrl('course 42')
  assert.match(avatar, /^data:image\/svg\+xml,/)
  assert.match(decodeURIComponent(avatar), /<ellipse/)
  assert.equal(getCourseAvatarUrl('course 42'), avatar)
  assert.notEqual(getCourseAvatarUrl('course 43'), avatar)
})

test('generates a local avatar when the course identifier is blank', () => {
  assert.match(getCourseAvatarUrl('  '), /^data:image\/svg\+xml,/)
})
