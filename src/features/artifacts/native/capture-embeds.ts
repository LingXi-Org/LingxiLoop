import { http } from '@/api/core/http'
import { withEmbedPreviews } from './embed-preview-snapshot'
import type { ArtifactDocument } from '../../../../shared/artifact-document'

/** Export owns a bounded, isolated rendering surface. It never mounts hidden
 * editing canvases or changes the user's document to obtain a preview. */
async function capture(document: ArtifactDocument, pageId: string, nodeId: string, hash: string, width: number, height: number, signal?: AbortSignal, pageHash?: string): Promise<string> {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
  const nonce = crypto.randomUUID(), requestId = crypto.randomUUID(), frame = window.document.createElement('iframe')
  frame.sandbox.add('allow-scripts')
  frame.referrerPolicy = 'no-referrer'
  frame.title = '导出隔离内容'
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${Math.max(1, width)}px;height:${Math.max(1, height)}px;border:0;pointer-events:none`
  const grant = await http<{ url: string }>(`/artifacts/${encodeURIComponent(document.id)}/embeds/${encodeURIComponent(pageId)}/${encodeURIComponent(nodeId)}/grant`, { method: 'POST', body: JSON.stringify({ sha256: hash, nonce, pageHash }), signal })
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
  frame.src = grant.url
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, data?: string) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); window.removeEventListener('message', receive); frame.remove(); error ? reject(error) : resolve(data!) }
    const abort = () => finish(new DOMException('Export cancelled', 'AbortError'))
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'lingxi:embed:captured' || event.data.nonce !== nonce || event.data.requestId !== requestId) return
      if (event.data.error) { finish(new Error(`隔离内容导出失败：${String(event.data.error).slice(0, 200)}`)); return }
      const data = event.data.dataUrl
      if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 16 * 1024 * 1024) { finish(new Error('隔离内容未返回有效的预览图片。')); return }
      finish(undefined, data)
    }
    const timer = setTimeout(() => finish(new Error('隔离内容导出超时，请重试。')), 20_000)
    window.addEventListener('message', receive)
    signal?.addEventListener('abort', abort, { once: true })
    frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'lingxi:embed:capture', nonce, requestId }, '*'), { once: true })
    frame.addEventListener('error', () => finish(new Error('隔离内容暂时无法载入。')), { once: true })
    window.document.body.append(frame)
  })
}
export async function captureEmbedPreviews(document: ArtifactDocument, signal?: AbortSignal, pageVersions?: Record<string, string>): Promise<ArtifactDocument> {
  return withEmbedPreviews(document, async ({ pageId, nodeId, node }) => {
    if (!node.embed?.sourceHash) throw new Error('隔离内容尚未保存，无法导出。')
    return capture(document, pageId, nodeId, node.embed.sourceHash, node.width, node.height, signal, pageVersions?.[pageId])
  })
}
