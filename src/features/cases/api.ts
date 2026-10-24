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
export interface GeneratedCaseCover {
  schemaVersion: 1
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'cancelled'
  fingerprint: string
  generation: number
  alt: string | null
  previewUrl: string | null
  interactiveUrl: string | null
  canRetry: boolean
}
export interface CaseArticle extends CaseInput {
  generatedCover?: GeneratedCaseCover | null
  id: string
  companyId: string
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
  retryCover: (article: CaseArticle, snapshot: 'draft'|'published' = 'draft') => {
    const cover = article.generatedCover
    if (!cover) return Promise.reject(new Error('当前案例没有可重试的封面'))
    return http<CaseArticle>(`${base(article.id)}/retry-cover`, { method:'POST',body:JSON.stringify({ snapshot,
      fingerprint:cover.fingerprint,expectedGeneration:cover.generation,idempotencyKey:`${cover.fingerprint}:${cover.generation}` }) })
  },
  backfillCovers: (afterId = '', limit = 25) => http<{scanned:number;nextAfterId:string|null;pending:number;succeeded:number;failed:number;cancelled:number}>('/cases/covers/backfill', { method:'POST',body:JSON.stringify({afterId,limit}) }),
  file: (id: string, mime: string, data: string) => http<{ url: string }>(`${base(id)}/files`, { method: 'POST', body: JSON.stringify({ mime, data }) }),
  image: (id: string, mime: string, data: string) => http<{ url: string }>(`${base(id)}/images`, { method: 'POST', body: JSON.stringify({ mime, data }) }),
}
