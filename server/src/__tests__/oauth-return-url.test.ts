import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedReturnUrl, matchesAllowedReturnUrl } from '../oauth-return-url.js'

test('OAuth return allowlist compares HTTP URL components and path boundaries', () => {
  const allowed = 'https://loop.example.com/auth'
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com/auth', allowed), true)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com/auth/done?n=abc', allowed), true)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com/authentic', allowed), false)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com.example.invalid/auth', allowed), false)
  assert.equal(matchesAllowedReturnUrl('http://loop.example.com/auth', allowed), false)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com:444/auth', allowed), false)
  assert.equal(matchesAllowedReturnUrl('https://user@loop.example.com/auth', allowed), false)
})

test('OAuth return allowlist handles default ports and custom app callbacks', () => {
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com:443/path', 'https://loop.example.com/path'), true)
  assert.equal(matchesAllowedReturnUrl('lingxiloop://auth?n=fresh', 'lingxiloop://auth'), true)
  assert.equal(matchesAllowedReturnUrl('lingxiloop://auth/complete?n=fresh', 'lingxiloop://auth'), true)
  assert.equal(matchesAllowedReturnUrl('lingxiloop://auth.evil?n=fresh', 'lingxiloop://auth'), false)
  assert.equal(matchesAllowedReturnUrl('lingxiloop://authentic?n=fresh', 'lingxiloop://auth'), false)
})

test('OAuth return allowlist rejects malformed URLs and honors configured queries', () => {
  assert.equal(isAllowedReturnUrl('not a url', ['https://loop.example.com/']), false)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com/?channel=mobile', 'https://loop.example.com/?channel=desktop'), false)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com/?channel=desktop', 'https://loop.example.com/?channel=desktop'), true)
  assert.equal(matchesAllowedReturnUrl('https://loop.example.com/#preset', 'https://loop.example.com/'), false)
})
