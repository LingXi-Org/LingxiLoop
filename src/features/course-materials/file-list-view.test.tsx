import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { KnowledgeSource } from '../knowledge/contracts'

// Radix waits for the browser's image load event. Expose the configured image
// and fallback here so this regression checks the source passed by each row.
mock.module('../../components/ui/avatar.tsx', { namedExports: {
  Avatar: ({ children, ...props }: PropsWithChildren<{ 'data-user-id'?: string }>) => <span {...props}>{children}</span>,
  AvatarImage: (props: { src?: string; alt?: string }) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: PropsWithChildren) => <span {...props}>{children}</span>,
} })
const { FileListView } = await import('./file-list-view')

const source = (id: string, fields: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id, kind: 'file', title: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 1,
  originalUrl: null, status: 'ready', stage: 'ready', error: null, isTruncated: false,
  visibilityScope: 'PROJECT', ownerUserId: id, ownerName: '林老师', createdBy: 'another-user', createdVia: 'AGENT',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...fields,
})
function render(files: KnowledgeSource[], publicSpace = true) {
  return renderToStaticMarkup(<FileListView files={files} publicSpace={publicSpace} selected={new Set()} busyIds={new Set()}
    sort="modified-desc" readOnly onSelect={() => {}} onSelectAll={() => {}} onSort={() => {}}
    onOpen={() => {}} onDownload={() => {}} onRename={() => {}} onDelete={() => {}} onRetry={() => {}} />)
}

test('public material avatars follow authorized owner IDs and current URLs even for AGENT-created sources', () => {
  const rows = [source('teacher-a', { ownerAvatarUrl: 'https://assets.invalid/a.png' }),
    source('teacher-b', { ownerAvatarUrl: 'https://assets.invalid/b.png' })]
  const html = render(rows)
  for (const id of ['teacher-a', 'teacher-b']) assert.match(html, new RegExp(`data-user-id="${id}"`))
  for (const image of ['a', 'b']) assert.match(html, new RegExp(`src="https://assets.invalid/${image}\\.png"`))
  assert.doesNotMatch(html, /data-user-id="another-user"/)
  assert.match(html, /data-size="sm"|size="sm"/)
  assert.doesNotMatch(html, /mt-1[^<]*data-user-id/)
  const refreshed = render([source('teacher-a', { ownerAvatarUrl: 'https://assets.invalid/a-new.png' })])
  assert.match(refreshed, /src="https:\/\/assets.invalid\/a-new.png"/)
  assert.doesNotMatch(refreshed, /src="https:\/\/assets.invalid\/a.png"/)
})

test('missing or broken owner images retain the shared accessible initial fallback', () => {
  const html = render([source('missing', { ownerAvatarUrl: null }), source('broken', { ownerAvatarUrl: 'https://assets.invalid/broken.png' })])
  assert.match(html, /aria-label="林老师未设置头像或头像加载失败"/)
  assert.match(html, />林<\/span>/)
  assert.match(html, /src="https:\/\/assets.invalid\/broken.png"/)
  assert.doesNotMatch(render([source('blank', { ownerAvatarUrl: '  ' })]), /src=/)
})

test('private materials do not render an uploader column or avatar profile', () => {
  const html = render([source('private-owner', { ownerAvatarUrl: 'https://assets.invalid/private.png' })], false)
  assert.doesNotMatch(html, /上传教师|data-user-id|private.png|林老师/)
})
