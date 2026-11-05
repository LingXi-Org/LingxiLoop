import assert from 'node:assert/strict'
import test from 'node:test'
import { artifactAssetRequest, requireAssetContentType } from './assets-policy'

test('only current artifact storage endpoints receive authorization', () => {
  const base = 'https://app.example/editor'
  assert.equal(artifactAssetRequest('/api/artifacts/mine/assets/image_1', 'mine', base).authenticated, true)
  assert.equal(artifactAssetRequest('/api/artifacts/mine/original-assets/image_1', 'mine', base).authenticated, true)
  for (const url of ['/api/im/channels/private/messages', '/api/artifacts/other/assets/image_1', '/api/artifacts/mine/source', '/api/artifacts/mine/assets/a?redirect=/api/session']) assert.throws(() => artifactAssetRequest(url, 'mine', base))
  assert.equal(artifactAssetRequest('https://external.example/image.png', 'mine', base).authenticated, false)
  assert.equal(artifactAssetRequest('/_blob/public-capability', 'mine', base).authenticated, false)
  assert.throws(() => artifactAssetRequest('javascript:alert(1)', 'mine', base))
})
test('JSON or HTML cannot be exported as a falsely declared image', () => {
  for (const type of ['application/json', 'text/html', null]) assert.throws(() => requireAssetContentType(type))
  assert.equal(requireAssetContentType('image/png'), 'image/png')
  assert.equal(requireAssetContentType('font/woff2'), 'font/woff2')
})
