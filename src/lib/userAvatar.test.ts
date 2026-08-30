import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_USER_AVATAR_URL, resolveUserAvatarUrl } from './userAvatar'

test('uses the configured Marbles avatar when a user has no custom avatar', () => {
  assert.equal(resolveUserAvatarUrl(null), DEFAULT_USER_AVATAR_URL)
  assert.equal(resolveUserAvatarUrl('  '), DEFAULT_USER_AVATAR_URL)
})

test('preserves a configured user avatar', () => {
  assert.equal(resolveUserAvatarUrl('https://example.com/me.png'), 'https://example.com/me.png')
})

