import type { KnowledgeSource } from '../knowledge/contracts'
import type { MaterialContext } from './data'

export interface OriginalResource { blob: Blob; fileName: string; mimeType: string }
class OriginalResourceError extends Error {}
export function originalResourceErrorMessage(reason: unknown): string {
  return reason instanceof OriginalResourceError ? reason.message : '原文件暂时无法加载，请重试或联系资料管理者。'
}
export interface OriginalResourceTransport {
  detail(signal: AbortSignal): Promise<KnowledgeSource>
  fetch(url: string, init: RequestInit): Promise<Response>
  isCurrent(): boolean
  diagnostic?(event: OriginalResourceDiagnostic): void
}
export interface OriginalResourceDiagnostic {
  stage: 'detail' | 'metadata' | 'url' | 'file_request' | 'file_response' | 'file_body'
  status?: number
}
export const fetchMaterialOriginal: OriginalResourceTransport['fetch'] = (url, init) => globalThis.fetch(url, init)
export function formatOriginalResourceDiagnostic(event: OriginalResourceDiagnostic): string {
  return `[course-materials] original preview failed ${JSON.stringify({ stage: event.stage, ...(event.status === undefined ? {} : { status: event.status }) })}`
}

/** Each open fetches its own bytes. No Blob is shared through query caches. */
export async function loadMaterialOriginal(context: MaterialContext, signal: AbortSignal, transport: OriginalResourceTransport): Promise<OriginalResource> {
  const assertCurrent = () => {
    signal.throwIfAborted()
    if (!transport.isCurrent()) throw new DOMException('Preview scope changed', 'AbortError')
  }
  let stage: OriginalResourceDiagnostic['stage'] = 'detail'
  let status: number | undefined
  try {
  for (let attempt = 0; attempt < 2; attempt++) {
    assertCurrent()
    stage = 'detail'; status = undefined
    const detail = await transport.detail(signal)
    assertCurrent()
    stage = 'metadata'
    if (!detail.capabilities?.canDownload) throw new OriginalResourceError('原文件目前无法访问，请联系课程教师确认权限。')
    if (!detail.originalFileUrl) throw new OriginalResourceError('原文件暂时不可用，请联系资料管理者。')
    stage = 'url'
    const url = new URL(detail.originalFileUrl, window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol)) throw new OriginalResourceError('原文件地址不可用。')
    const local = url.origin === window.location.origin
    stage = 'file_request'
    const response = await transport.fetch(url.href, {
      signal, cache: 'no-store', credentials: local ? 'include' : 'omit',
      ...(local ? { headers: { 'x-company-id': context.companyId, 'x-project-id': context.projectId } } : {}),
    })
    assertCurrent()
    stage = 'file_response'; status = response.status
    // Refresh an expired presign only through the same authorized detail API.
    if ((response.status === 401 || response.status === 403) && attempt === 0) continue
    if (response.status === 401 || response.status === 403) throw new OriginalResourceError('原文件访问权限已失效，请重新登录或联系课程教师。')
    if (response.status === 404) throw new OriginalResourceError('原文件不存在或已不可访问，请联系资料管理者。')
    if (!response.ok) throw new OriginalResourceError('原文件服务暂时不可用，请稍后重试。')
    stage = 'file_body'
    const blob = await response.blob()
    assertCurrent()
    return { blob, fileName: detail.title, mimeType: detail.mimeType ?? blob.type }
  }
  throw new OriginalResourceError('原文件访问已失效，请重试。')
  } catch (error) {
    if (!signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
      const candidate = status ?? (error && typeof error === 'object' && 'status' in error ? error.status : undefined)
      const safeStatus = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599 ? candidate : undefined
      try { transport.diagnostic?.({ stage, ...(safeStatus === undefined ? {} : { status: safeStatus }) }) } catch { /* diagnostics cannot change recovery */ }
    }
    throw error
  }
}
