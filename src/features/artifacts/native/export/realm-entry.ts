import '../../../../styles/app-fonts.css'
import '../../../../styles/fonts.css'
import '../editor-fonts.css'
import type { ArtifactDocument } from '../../../../../shared/artifact-document'
import type { ArtifactExportFormat } from '../export-artifact'
import { executeExport } from './execute'
import { releaseAllExportWorkers } from './worker-lifecycle'

const nonce = location.hash.slice(1)
let connected = false
window.addEventListener('message', event => {
  if (connected || event.source !== parent || event.origin !== location.origin || event.data?.type !== 'lingxi-export:connect' || event.data.nonce !== nonce || !event.ports[0]) return
  connected = true
  const port = event.ports[0], controller = new AbortController()
  const assets = new Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>()
  let serial = 0, started = false
  port.onmessage = message => {
    const data = message.data
    if (data?.type === 'cancel') { controller.abort(); for (const pending of assets.values()) pending.reject(new DOMException('Export cancelled', 'AbortError')); assets.clear(); releaseAllExportWorkers(); return }
    if (data?.type === 'asset-result') {
      const pending = assets.get(data.requestId)
      if (!pending) return
      assets.delete(data.requestId)
      if (data.blob instanceof Blob) pending.resolve(data.blob)
      else pending.reject(new Error(data.error ?? '导出资源加载失败'))
      return
    }
    if (data?.type !== 'start' || started || !['html', 'pdf', 'pptx', 'png', 'jpeg', 'svg'].includes(data.format)) return
    started = true
    void (async () => {
      try {
        const result = await executeExport(data.document as ArtifactDocument, {
          format: data.format as ArtifactExportFormat, signal: controller.signal,
          resolveAsset: asset => new Promise<Blob>((resolve, reject) => {
            controller.signal.throwIfAborted()
            const requestId = String(++serial); assets.set(requestId, { resolve, reject })
            port.postMessage({ type: 'asset', requestId, assetId: asset.id })
          }),
          onProgress: (completed, total) => port.postMessage({ type: 'progress', completed, total }),
        })
        controller.signal.throwIfAborted()
        port.postMessage({ type: 'result', result })
      } catch (error) {
        port.postMessage({ type: 'error', name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : '导出失败' })
      } finally {
        releaseAllExportWorkers(); assets.clear()
      }
    })()
  }
  port.start()
})
window.addEventListener('pagehide', releaseAllExportWorkers)
const ready = () => { if (parent !== window && /^[a-zA-Z0-9-]{1,128}$/.test(nonce)) parent.postMessage({ type: 'lingxi-export:ready', nonce }, location.origin) }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready()
