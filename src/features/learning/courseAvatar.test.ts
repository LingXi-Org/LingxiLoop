import assert from 'node:assert/strict'
import test from 'node:test'
import { getCourseAvatarUrl } from './courseAvatar'

test('builds a stable DiceBear Planets avatar URL for a course', () => {
  assert.equal(
    getCourseAvatarUrl('course 42'),
    'https://api.dicebear.com/10.x/planets/svg?planetColor=e27a8c,e37f64,d88a40,c1982a,d67cb2&seed=course%2042',
  )
})

test('uses the configured fallback seed when the course identifier is blank', () => {
  assert.equal(
    getCourseAvatarUrl('  '),
    'https://api.dicebear.com/10.x/planets/svg?planetColor=e27a8c,e37f64,d88a40,c1982a,d67cb2&seed=Felix',
  )
})
