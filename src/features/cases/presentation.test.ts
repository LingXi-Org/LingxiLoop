import assert from 'node:assert/strict'
import test from 'node:test'
import type { CaseArticle } from './api'
import { caseCatalogue, relatedCases, caseOutline } from './presentation'

const article = (id: string, changes: Partial<CaseArticle> = {}): CaseArticle => ({
  id, companyId: 'school', view: 'reader', title: id, summary: '', body: '', cover: null,
  category: '注意力机制', tags: [], authorId: 'teacher', authorName: '王老师', authorAvatarUrl: null,
  status: 'published', version: 1, publishedVersion: 1, hasUnpublishedChanges: false,
  canManage: false, indexStatus: 'ready', indexError: null,
  createdAt: '2026-11-01', updatedAt: '2026-11-01', publishedAt: '2026-11-01', ...changes,
})

test('the newest published case leads once; more reveals six more without duplicates', () => {
  const items = Array.from({ length: 14 }, (_, i) => article(String(i), { publishedAt: `2026-11-${String(i + 1).padStart(2, '0')}` }))
  const first = caseCatalogue(items, { visibleCount: 6 })
  assert.deepEqual([first.featured?.id, first.items.map(item => item.id), first.hasMore], ['13', ['12', '11', '10', '9', '8', '7'], true])
  assert.equal(caseCatalogue(items, { visibleCount: 12 }).items.length, 12)
  assert.equal(caseCatalogue(items, { visibleCount: 18 }).hasMore, false)
  assert.equal(items[0].id, '0')
})

test('filters keep the latest hero and search the remaining cases without duplicates', () => {
  const hero = article('hero', { publishedAt: '2026-11-04' })
  const match = article('match', { category: 'Agent', body: 'Only in BODY', tags: ['Tool'] })
  const items = [hero, match, article('other')]
  for (const filters of [{ category: 'Agent' }, { search: ' body ' }, { search: 'TOOL' }]) {
    assert.deepEqual(caseCatalogue(items, filters), { featured: hero, items: [match], hasMore: false })
  }
  assert.deepEqual(caseCatalogue(items, { search: 'hero' }), { featured: hero, items: [], hasMore: false })
  assert.deepEqual(caseCatalogue(items, { search: 'body', category: '注意力机制' }), { featured: hero, items: [], hasMore: false })
  assert.deepEqual(caseCatalogue(items, { search: 'missing' }), { featured: hero, items: [], hasMore: false })
  const many = Array.from({ length: 8 }, (_, i) => article(String(i), { category: 'Agent' }))
  assert.equal(caseCatalogue([hero, ...many], { category: 'Agent' }).items.length, 8)
})

test('management keeps unpublished cases visible and empty catalogues stay empty', () => {
  const draft = article('draft', { status: 'draft', publishedAt: null, view: 'manage' })
  assert.deepEqual(caseCatalogue([draft]), { featured: null, items: [draft], hasMore: false })
  assert.deepEqual(caseCatalogue([], { category: 'Agent' }), { featured: null, items: [], hasMore: false })
})

test('related cases prefer the category, exclude self and never include drafts or another company', () => {
  const current = article('current')
  const cases = [current, article('new-other', { category: 'Agent', publishedAt: '2026-11-04' }), article('same'),
    article('draft', { status: 'draft' }), article('other-company', { companyId: 'other' }),
    article('private-draft', { view: 'manage' }), article('other', { category: 'Agent' })]
  assert.deepEqual(relatedCases(cases, current).map(item => item.id), ['same', 'new-other', 'other'])
})

test('outline anchors remain unique for repeated headings and omit empty labels', () => {
  assert.deepEqual(caseOutline(['课堂流程', ' ', '课堂流程', '在线 softmax']), [
    { id: 'case-section-0', title: '课堂流程', index: 0 },
    { id: 'case-section-2', title: '课堂流程', index: 2 },
    { id: 'case-section-3', title: '在线 softmax', index: 3 },
  ])
})
