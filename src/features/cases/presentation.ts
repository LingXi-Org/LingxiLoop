import type { CaseArticle } from './api'

const newestFirst = (a: CaseArticle, b: CaseArticle) =>
  Date.parse(b.publishedAt ?? b.updatedAt) - Date.parse(a.publishedAt ?? a.updatedAt)

export function caseCatalogue(items: CaseArticle[], { search = '', category = '', visibleCount = 6 }: {
  search?: string; category?: string; visibleCount?: number
} = {}) {
  const sorted = [...items].sort(newestFirst)
  const featured = sorted.find(item => item.status === 'published' && item.view === 'reader') ?? null
  const query = search.trim().toLocaleLowerCase()
  if (query || category) return { featured, items: sorted.filter(item => (!category || item.category === category)
    && (!query || [item.title, item.summary, item.body, item.category, ...item.tags].join(' ').toLocaleLowerCase().includes(query))), hasMore: false }
  return { featured, items: sorted.slice(0, visibleCount), hasMore: sorted.length > visibleCount }
}

export function relatedCases(items: CaseArticle[], current: CaseArticle): CaseArticle[] {
  return items.filter(item => item.id !== current.id && item.companyId === current.companyId
    && item.status === 'published' && item.view === 'reader')
    .sort((a, b) => Number(b.category === current.category) - Number(a.category === current.category) || newestFirst(a, b))
    .slice(0, 3)
}

export function caseOutline(headings: { title: string; level: number }[]) {
  const entries = headings.map(({ title, level }, index) => ({ id: `case-section-${index}`, title: title.trim(), level, index }))
    .filter(item => item.title)
  const baseLevel = entries.reduce((minimum, item) => Math.min(minimum, item.level), 6)
  return entries.map(item => ({ ...item, depth: item.level - baseLevel }))
}

export function caseDate(article: CaseArticle, short = false) {
  const date = new Date(article.publishedAt ?? article.createdAt ?? article.updatedAt)
  return short ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}
