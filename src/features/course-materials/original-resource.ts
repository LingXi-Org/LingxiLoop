import type { KnowledgeSource } from '../knowledge/contracts'
import type { MaterialContext } from './data'

export interface OriginalResource { blob: Blob; fileName: string; mimeType: string }
export interface OriginalResourceTransport {
  detail(signal: AbortSignal): Promise<KnowledgeSource>
  fetch(url: string, init: RequestInit): Promise<Response>
  isCurrent(): boolean
}

/** Each open fetches its own bytes. No Blob is shared through query caches. */
export async function loadMaterialOriginal(context: MaterialContext, signal: AbortSignal, transport: OriginalResourceTransport): Promise<OriginalResource> {
  const assertCurrent = () => {
    signal.throwIfAborted()
    if (!transport.isCurrent()) throw new DOMException('Preview scope changed', 'AbortError')
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    assertCurrent()
    const detail = await transport.detail(signal)
    assertCurrent()
    if (!detail.capabilities?.canDownload) throw new Error('原文件目前无法访问，请联系课程教师确认权限。')
    if (!detail.originalFileUrl) throw new Error('原文件暂时不可用，请联系资料管理者。')
    const url = new URL(detail.originalFileUrl, window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('原文件地址不可用。')
    const local = url.origin === window.location.origin
    const response = await transport.fetch(url.href, {
      signal, cache: 'no-store', credentials: local ? 'include' : 'omit',
      ...(local ? { headers: { 'x-company-id': context.companyId, 'x-project-id': context.projectId } } : {}),
    })
    assertCurrent()
    // Refresh an expired presign only through the same authorized detail API.
    if ((response.status === 401 || response.status === 403) && attempt === 0) continue
    if (response.status === 401 || response.status === 403) throw new Error('原文件访问权限已失效，请重新登录或联系课程教师。')
    if (response.status === 404) throw new Error('原文件不存在或已不可访问，请联系资料管理者。')
    if (!response.ok) throw new Error('原文件服务暂时不可用，请稍后重试。')
    const blob = await response.blob()
    assertCurrent()
    return { blob, fileName: detail.title, mimeType: detail.mimeType ?? blob.type }
  }
  throw new Error('原文件访问已失效，请重试。')
}
