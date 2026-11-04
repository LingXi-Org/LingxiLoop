import type { ContentDocument } from '@/features/content-editor'
import { http } from '@/api/core/http'
import type { CaseView } from './case-view'
import type { CoverColor } from './cover-design'

export interface CaseInput {
  title: string
  summary: string
  body: string
  editorDocument?: ContentDocument | null
  summaryDocument?: ContentDocument | null
  cover: string | null
  coverText?: string
  coverColor?: CoverColor
  college?: string
  category: string
  tags: string[]
}
export interface CaseArticle extends CaseInput {
  view: CaseView
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
export interface CaseList { items: CaseArticle[]; categories: string[]; canManage: boolean; view: CaseView }
export interface CaseOptions { categories: string[]; colleges: string[] }
const base = (id: string) => `/cases/${encodeURIComponent(id)}`
export const casesApi = {
  options: (signal?: AbortSignal) => http<CaseOptions>('/cases/options', { signal }),
  createOption: (kind: 'category' | 'college', name: string) => http<CaseOptions>('/cases/options', { method: 'POST', body: JSON.stringify({ kind, name }) }),
  list: (q: string, category: string, view: CaseView = 'reader', signal?: AbortSignal) => http<CaseList>(`/cases?${new URLSearchParams({ q, category, view })}`, { signal }),
  detail: (id: string, view: CaseView = 'reader', signal?: AbortSignal) => http<CaseArticle>(`${base(id)}?${new URLSearchParams({ view })}`, { signal }),
  save: (input: CaseInput, article?: CaseArticle) => http<CaseArticle>(article ? base(article.id) : '/cases', { method: article ? 'PUT' : 'POST', body: JSON.stringify({ ...input, ...(article ? { version: article.version } : {}) }) }),
  action: (article: CaseArticle, action: 'publish' | 'unpublish' | 'retry-index') => http<CaseArticle>(`${base(article.id)}/${action}`, { method: 'POST', body: JSON.stringify({ version: article.version }) }),
  remove: (article: Pick<CaseArticle, 'id' | 'version'>) => http<{ deleted: true; id: string }>(base(article.id), { method: 'DELETE', body: JSON.stringify({ version: article.version }) }),
  file: (id: string, mime: string, data: string) => http<{ url: string }>(`${base(id)}/files`, { method: 'POST', body: JSON.stringify({ mime, data }) }),
  image: (id: string, mime: string, data: string) => http<{ url: string }>(`${base(id)}/images`, { method: 'POST', body: JSON.stringify({ mime, data }) }),
}
