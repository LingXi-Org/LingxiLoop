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
    if (!detail.capabilities?.canDownload || !detail.originalFileUrl) throw new Error('原文件暂时无法查看。')
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
    if (!response.ok) throw new Error('原文件暂时无法加载，请重试或下载。')
    const blob = await response.blob()
    assertCurrent()
    return { blob, fileName: detail.title, mimeType: detail.mimeType ?? blob.type }
  }
  throw new Error('原文件访问已失效，请重试。')
}
