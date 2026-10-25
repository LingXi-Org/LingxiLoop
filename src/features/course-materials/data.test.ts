import assert from 'node:assert/strict'
import test from 'node:test'
import type { KnowledgeSource } from '../knowledge/contracts'
import { fileKind, filterAndSortFiles, materialQueryKey, sourceStatusLabel } from './data'

const source = (id: string, fields: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id, kind: 'file', title: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 1,
  originalUrl: null, status: 'ready', stage: 'ready', error: null, isTruncated: false,
  visibilityScope: 'PROJECT', ownerUserId: 'teacher', createdBy: 'teacher', createdVia: 'USER',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...fields,
})

test('materials sort raw bytes and timestamps and apply controlled search and format filters', () => {
  const rows = [source('big', { sizeBytes: 2_000_000, updatedAt: '2026-02-01T00:00:00Z' }),
    source('small', { title: '课堂笔记.md', mimeType: 'text/markdown', sizeBytes: 900, updatedAt: '2026-10-01T00:00:00Z' })]
  assert.deepEqual(filterAndSortFiles(rows, '', 'all', 'size-asc').map(f => f.id), ['small', 'big'])
  assert.deepEqual(filterAndSortFiles(rows, '', 'all', 'modified-desc').map(f => f.id), ['small', 'big'])
  assert.deepEqual(filterAndSortFiles(rows, '笔记', 'markdown', 'name-asc').map(f => f.id), ['small'])
  assert.equal(filterAndSortFiles(rows, '笔记', 'pdf', 'name-asc').length, 0)
  assert.equal(rows[0].id, 'big', 'sorting must not mutate query results')
})

test('materials format mapping includes Office, images, archive and unknown while keeping MIME authoritative', () => {
  for (const [title, mimeType, expected] of [
    ['a.pptx', null, 'presentation'], ['a.xlsx', null, 'spreadsheet'], ['a.docx', null, 'document'],
    ['a.JPG', null, 'image'], ['a.png', 'image/png', 'image'], ['a.zip', null, 'archive'],
    ['a.md', null, 'markdown'], ['a.txt', null, 'text'], ['a.bin', null, 'unknown'],
    ['Renamed lecture', 'application/pdf', 'pdf'],
  ] as const) assert.equal(fileKind(source('a', { title, mimeType })), expected)
  assert.equal(sourceStatusLabel(source('x', { status: 'stored', stage: 'stored_only' })), '仅保存原文件')
})

test('materials query keys isolate organization, account, course and public/private spaces', () => {
  const key = materialQueryKey({ companyId: 'org', userId: 'one', projectId: 'course', space: 'private' })
  for (const change of [{ companyId: 'other' }, { userId: 'two' }, { projectId: 'other' }, { space: 'public' as const }]) {
    assert.notDeepEqual(key, materialQueryKey({ companyId: 'org', userId: 'one', projectId: 'course', space: 'private', ...change }))
  }
})
