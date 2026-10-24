import type { ContentDocument } from '@/features/content-editor'
import { http } from '@/api/core/http'

export interface CaseInput {
  title: string
  summary: string
  body: string
  editorDocument?: ContentDocument | null
  summaryDocument?: ContentDocument | null
  cover: string | null
  category: string
  tags: string[]
}
export interface CaseArticle extends CaseInput {
  id: string
  companyId: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  createdAt: string
  status: 'draft' | 'published' | 'unpublished'
  version: number
  publishedVersion: number | null
  hasUnpublishedChanges: boolean
  canManage: boolean
  indexStatus: string | null
  indexError: string | null
  updatedAt: string
  publishedAt: string | null
}
export interface CaseList { items: CaseArticle[]; categories: string[]; canManage: boolean }
const base = (id: string) => `/cases/${encodeURIComponent(id)}`
export const casesApi = {
  list: (q: string, category: string, signal?: AbortSignal) => http<CaseList>(`/cases?${new URLSearchParams({ q, category })}`, { signal }),
  detail: (id: string, signal?: AbortSignal) => http<CaseArticle>(base(id), { signal }),
  save: (input: CaseInput, article?: CaseArticle) => http<CaseArticle>(article ? base(article.id) : '/cases', { method: article ? 'PUT' : 'POST', body: JSON.stringify({ ...input, ...(article ? { version: article.version } : {}) }) }),
  action: (article: CaseArticle, action: 'publish' | 'unpublish' | 'retry-index') => http<CaseArticle>(`${base(article.id)}/${action}`, { method: 'POST', body: JSON.stringify({ version: article.version }) }),
  file: (id: string, mime: string, data: string) => http<{ url: string }>(`${base(id)}/files`, { method: 'POST', body: JSON.stringify({ mime, data }) }),
  image: (id: string, mime: string, data: string) => http<{ url: string }>(`${base(id)}/images`, { method: 'POST', body: JSON.stringify({ mime, data }) }),
}
