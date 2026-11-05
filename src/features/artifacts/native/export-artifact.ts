import type { ArtifactAsset, ArtifactDocument } from '../../../../shared/artifact-document'

export type ArtifactExportFormat = 'html' | 'pdf' | 'pptx' | 'png' | 'jpeg' | 'svg'
export interface ArtifactExportOptions {
  format: ArtifactExportFormat
  resolveAsset?: (asset: ArtifactAsset, signal?: AbortSignal) => Promise<Blob>
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}
export interface ArtifactExportResult { blob: Blob; filename: string; warnings: string[] }

/** A new trusted realm per attempt also resets failed shared/inner ES-module loads. */
export async function exportArtifact(document: ArtifactDocument, options: ArtifactExportOptions): Promise<ArtifactExportResult> {
  options.signal?.throwIfAborted()
  const snapshot = structuredClone(document)
  if (typeof window === 'undefined') return (await import('./export/execute')).executeExport(snapshot, options)
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID(), frame = window.document.createElement('iframe'), channel = new MessageChannel()
    const controller = new AbortController()
    let finished = false, connected = false, abortTimer: ReturnType<typeof setTimeout> | undefined
    const readyTimer = setTimeout(() => finish(new Error('导出功能未能加载，请检查网络后重试。')), 15_000)
    frame.dataset.artifactExportRealm = nonce
    frame.title = '文档导出'; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1920px;height:1080px;border:0;pointer-events:none;'
    frame.src = `${import.meta.env.BASE_URL}artifact-export.html#${nonce}`
    function finish(error?: unknown, result?: ArtifactExportResult) {
      if (finished) return
      finished = true; clearTimeout(readyTimer); clearTimeout(abortTimer)
      options.signal?.removeEventListener('abort', abort); window.removeEventListener('message', ready)
      controller.abort(); channel.port1.close(); if (!connected) channel.port2.close(); frame.remove()
      if (result) resolve(result); else reject(error)
    }
    function abort() {
      if (finished) return
      controller.abort()
      if (connected) channel.port1.postMessage({ type: 'cancel' })
      // Give the renderer a turn to terminate workers/dispose DOM, then remove
      // its browsing context even if a network or screenshot operation stalls.
      abortTimer ??= setTimeout(() => finish(options.signal?.reason ?? new DOMException('Export cancelled', 'AbortError')), connected ? 250 : 0)
    }
    function ready(event: MessageEvent) {
      if (connected || event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.type !== 'lingxi-export:ready' || event.data.nonce !== nonce) return
      connected = true; clearTimeout(readyTimer)
      frame.contentWindow!.postMessage({ type: 'lingxi-export:connect', nonce }, window.location.origin, [channel.port2])
      channel.port1.postMessage({ type: 'start', document: snapshot, format: options.format })
    }
    channel.port1.onmessage = event => {
      if (finished) return
      const data = event.data
      if (data?.type === 'progress') {
        try { options.onProgress?.(data.completed, data.total) }
        catch (error) { channel.port1.postMessage({ type: 'cancel' }); finish(error) }
        return
      }
      if (data?.type === 'asset') {
        const asset = snapshot.assets[data.assetId]
        void (async () => {
          try {
            if (!asset) throw new Error('导出资源不存在')
            let blob: Blob
            if (options.resolveAsset) blob = await options.resolveAsset(asset, controller.signal)
            else {
              const url = new URL(asset.url, window.location.href)
              if (url.pathname.startsWith('/api/')) throw new Error('受保护资源需要当前文档的授权读取器')
              const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' })
              if (!response.ok) throw new Error(`导出资源加载失败 (${response.status})：${asset.id}`)
              blob = await response.blob()
            }
            if (!finished) channel.port1.postMessage({ type: 'asset-result', requestId: data.requestId, blob })
          } catch (error) { if (!finished) channel.port1.postMessage({ type: 'asset-result', requestId: data.requestId, error: error instanceof Error ? error.message : '导出资源加载失败' }) }
        })()
      } else if (data?.type === 'result') {
        if (options.signal?.aborted) finish(options.signal.reason ?? new DOMException('Export cancelled', 'AbortError'))
        else finish(undefined, data.result as ArtifactExportResult)
      } else if (data?.type === 'error') {
        if (options.signal?.aborted) finish(options.signal.reason ?? new DOMException('Export cancelled', 'AbortError'))
        else { const error = new Error(data.message ?? '导出失败'); error.name = data.name ?? 'Error'; finish(error) }
      }
    }
    channel.port1.start(); window.addEventListener('message', ready); options.signal?.addEventListener('abort', abort, { once: true })
    window.document.body.append(frame)
    if (options.signal?.aborted) abort()
  })
}

export function downloadArtifactExport(result: ArtifactExportResult) {
  const url = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = result.filename
  document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
