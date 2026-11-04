import type { CaseArticle } from './api'

const newestFirst = (a: CaseArticle, b: CaseArticle) =>
  Date.parse(b.publishedAt ?? b.updatedAt) - Date.parse(a.publishedAt ?? a.updatedAt)

export function caseCatalogue(items: CaseArticle[], filtered: boolean, visibleCount: number) {
  if (filtered) return { featured: null, items, hasMore: false }
  const sorted = [...items].sort(newestFirst)
  const featured = sorted.find(item => item.status === 'published' && item.view === 'reader') ?? null
  const rest = sorted.filter(item => item.id !== featured?.id)
  return { featured, items: rest.slice(0, visibleCount), hasMore: rest.length > visibleCount }
}

export function relatedCases(items: CaseArticle[], current: CaseArticle): CaseArticle[] {
  return items.filter(item => item.id !== current.id && item.companyId === current.companyId
    && item.status === 'published' && item.view === 'reader')
    .sort((a, b) => Number(b.category === current.category) - Number(a.category === current.category) || newestFirst(a, b))
    .slice(0, 3)
}

export function caseOutline(titles: string[]) {
  return titles.map((title, index) => ({ id: `case-section-${index}`, title: title.trim(), index }))
    .filter(item => item.title)
}

export function caseDate(article: CaseArticle, short = false) {
  const date = new Date(article.publishedAt ?? article.createdAt ?? article.updatedAt)
  return short ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}
