import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveUserAvatarUrl } from './userAvatar'

test('generates a stable local avatar for each user without a custom avatar', () => {
  const avatar = resolveUserAvatarUrl(null, 'user-1')
  assert.match(avatar, /^data:image\/svg\+xml,/)
  assert.match(decodeURIComponent(avatar), /marbles-/)
  assert.equal(resolveUserAvatarUrl('  ', 'user-1'), avatar)
  assert.notEqual(resolveUserAvatarUrl(null, 'user-2'), avatar)
})

test('preserves a configured user avatar', () => {
  assert.equal(resolveUserAvatarUrl('https://example.com/me.png', 'user-1'), 'https://example.com/me.png')
})

test('replaces unreachable remote generated avatars with a local avatar', () => {
  assert.match(resolveUserAvatarUrl('https://api.dicebear.com/10.x/marbles/svg?seed=x', 'user-1'), /^data:image\/svg\+xml,/)
  assert.match(resolveUserAvatarUrl('https://www.gravatar.com/avatar/x', 'user-1'), /^data:image\/svg\+xml,/)
})
