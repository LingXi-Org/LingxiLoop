import type { ArtifactDocument } from '../../../../shared/artifact-document'
import type { ArtifactExportFormat, ArtifactExportOptions, ArtifactExportResult } from './export-artifact'

type ExportTask={type:'start';document:ArtifactDocument;format:ArtifactExportFormat}
type SvgFontTask={type:'svg-font-image';source:string;fontFamily?:string}
type RealmOptions=Pick<ArtifactExportOptions,'signal'|'resolveAsset'|'onProgress'>

/** A fresh trusted document resets failed ESM graphs without reloading the editor. */
export function runArtifactRealm(task:ExportTask,options:RealmOptions):Promise<ArtifactExportResult>
export function runArtifactRealm(task:SvgFontTask,options:RealmOptions):Promise<string>
export function runArtifactRealm(task:ExportTask|SvgFontTask,options:RealmOptions):Promise<ArtifactExportResult|string> {
  options.signal?.throwIfAborted()
  return new Promise<ArtifactExportResult|string>((resolve, reject) => {
    const nonce = crypto.randomUUID(), frame = window.document.createElement('iframe'), channel = new MessageChannel()
    const controller = new AbortController()
    let finished = false, connected = false, abortTimer: ReturnType<typeof setTimeout> | undefined
    const readyTimer = setTimeout(() => finish(new Error(task.type==='svg-font-image'?'图形工具未能加载，请检查网络后重试。':'导出功能未能加载，请检查网络后重试。')), 15_000)
    frame.dataset.artifactExportRealm = nonce
    frame.title = task.type==='svg-font-image'?'图形字体处理':'文档导出'; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1920px;height:1080px;border:0;pointer-events:none;'
    frame.src = `${import.meta.env.BASE_URL}artifact-export.html#${nonce}`
    function finish(error?: unknown, result?: ArtifactExportResult|string) {
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
      abortTimer ??= setTimeout(() => finish(options.signal?.reason ?? new DOMException('已取消导出', 'AbortError')), connected ? 250 : 0)
    }
    function ready(event: MessageEvent) {
      if (connected || event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.type !== 'lingxi-export:ready' || event.data.nonce !== nonce) return
      connected = true; clearTimeout(readyTimer)
      frame.contentWindow!.postMessage({ type: 'lingxi-export:connect', nonce }, window.location.origin, [channel.port2])
      channel.port1.postMessage(task)
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
        const asset = task.type==='start'?task.document.assets[data.assetId]:undefined
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
        if (options.signal?.aborted) finish(options.signal.reason ?? new DOMException('已取消导出', 'AbortError'))
        else finish(undefined, data.result as ArtifactExportResult|string)
      } else if (data?.type === 'error') {
        if (options.signal?.aborted) finish(options.signal.reason ?? new DOMException('已取消导出', 'AbortError'))
        else { const error = new Error(data.message ?? '导出失败'); error.name = data.name ?? 'Error'; finish(error) }
      }
    }
    channel.port1.start(); window.addEventListener('message', ready); options.signal?.addEventListener('abort', abort, { once: true })
    window.document.body.append(frame)
    if (options.signal?.aborted) abort()
  })
}
