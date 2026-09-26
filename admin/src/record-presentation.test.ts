import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { metricNumber } from './analytics-data.js'
import { RecordValue } from './record-components.js'
import { accountStatus, formatValue, recordColumns, recordImage, recordTitle, resourceContentPath, safeImageUrl } from './record-presentation.js'

test('resource directories select useful columns without exposing raw payloads', () => {
  const user = { id: 'user-1', display_name: '林溪', email: 'lin@example.test', password_hash: 'private', data: { large: true }, created_at: '2026-09-06T00:00:00Z' }
  assert.equal(recordTitle(user), '林溪')
  assert.deepEqual(recordColumns([user], 'users'), ['email', 'status', 'last_login_at', 'created_at'])
  assert.deepEqual(recordColumns([], 'users'), recordColumns([user], 'users'))
  assert.equal(recordTitle({ id: 'untitled', name: { unexpected: true } }), 'untitled')
  assert.deepEqual([accountStatus({ id: 'a' }), accountStatus({ id: 'b', suspended_at: '2026-09-01' }), accountStatus({ id: 'c', suspended_at: '2026-09-01', deleted_at: '2026-09-02' })], ['active', 'suspended', 'deleted'])
})

test('image fields allow only safe HTTPS or same-origin paths and fall back to another valid image', () => {
  assert.deepEqual([
    safeImageUrl('/logo.svg'), safeImageUrl('https://images.example.test/avatar.png'),
    safeImageUrl('javascript:alert(1)'), safeImageUrl('//tracking.example.test/image'),
    safeImageUrl('/\\tracking.example.test/image'), safeImageUrl('https://user:password@example.test/a'),
    safeImageUrl('data:image/svg+xml,<svg/>'), safeImageUrl('/\n/tracking.example.test'),
    safeImageUrl('http://images.example.test/a'), safeImageUrl({ url: '/logo.svg' }),
  ], ['/logo.svg', 'https://images.example.test/avatar.png', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined])
  assert.equal(recordImage({ id: 'a', avatar_url: 'javascript:alert(1)', cover_url: '/logo.svg' }), '/logo.svg')
})

test('long resource content stays on the authenticated admin proxy', () => {
  assert.equal(resourceContentPath('/admin/resources/documents/document%201/content/body'), '/control/platform/resources/documents/document%201/content/body')
  assert.deepEqual(['/control/deployments', 'https://example.test/content', '/admin/resources/a/b/content/c?token=bad'].map(resourceContentPath), [undefined, undefined, undefined])
})

test('detail values use semantic fields and escape user content instead of rendering HTML', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(RecordValue, {
    value: { status: 'ACTIVE', description: '<script>alert(1)</script>', company_id: 'company/a', settings: { enabled: true } },
  })))
  assert.match(html, /<dl/)
  assert.match(html, /有效/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|<pre>/)
  assert.match(html, /organizations\/companies\/company%2Fa/)
  assert.match(html, /启用/)
})

test('missing and invalid numeric data stay distinct from successful results', () => {
  assert.deepEqual([formatValue(null), formatValue(false), formatValue(0), formatValue({ nested: true }), formatValue([1, 2])], ['—', '否', '0', '1 项属性', '2 项内容'])
  assert.deepEqual([metricNumber({ count: '12' }, 'count'), metricNumber({ count: 'invalid' }, 'count'), metricNumber({}, 'count')], [12, 0, 0])
})


test('workspace navigation preserves every resource under a business owner', async () => {
  const { ADMIN_RESOURCES } = await import('./resources.js')
  const { WORKSPACES, recordPath, resourceArea, listParameters } = await import('./workspace-model.js')
  for (const resource of ADMIN_RESOURCES) {
    assert.ok(WORKSPACES.some(item => item.path === resourceArea(resource.name)))
    assert.ok(recordPath(resource.name, 'id/a').endsWith('/id%2Fa'))
  }
  assert.equal(recordPath('companies'), '/organizations')
  assert.equal(recordPath('knowledge-jobs'), '/projects/knowledge-jobs')
  assert.equal(listParameters(new URLSearchParams('tab=学习&search=示例&companyId=other&cursor=MjA&previous=-'), { companyId: 'owner' }).toString(), 'search=%E7%A4%BA%E4%BE%8B&companyId=owner&cursor=MjA')
})
