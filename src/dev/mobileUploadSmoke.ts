import { api } from '@/api/client'

interface MemoryPerformance extends Performance {
  memory?: { usedJSHeapSize?: number }
}

function usedJsHeapBytes(): number | null {
  return (performance as MemoryPerformance).memory?.usedJSHeapSize ?? null
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return 'unavailable'
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

/**
 * Install an opt-in, on-device upload acceptance panel. This module is only
 * bundled when VITE_MOBILE_UPLOAD_SMOKE=1 and is never on the normal startup
 * path. Select a real large file so the measurement includes the exact
 * presign + WebView Blob PUT path used by chat attachments.
 */
export function installMobileUploadSmoke(): void {
  const panel = document.createElement('aside')
  panel.setAttribute('data-mobile-upload-smoke', '')
  panel.style.cssText = [
    'position:fixed', 'inset:auto 12px 12px 12px', 'z-index:2147483647',
    'padding:12px', 'border-radius:10px', 'background:#111827', 'color:white',
    'font:12px/1.4 ui-monospace,monospace', 'box-shadow:0 8px 30px #0008',
  ].join(';')

  const title = document.createElement('strong')
  title.textContent = 'Mobile upload smoke (choose a 24 MiB file)'
  const input = document.createElement('input')
  input.type = 'file'
  input.style.cssText = 'display:block;margin:8px 0;color:white'
  const run = document.createElement('button')
  run.type = 'button'
  run.textContent = 'Run presigned upload'
  run.disabled = true
  const output = document.createElement('pre')
  output.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;max-height:160px;overflow:auto'
  output.textContent = 'Authenticate first, then choose a representative large file.'

  input.addEventListener('change', () => {
    run.disabled = !input.files?.[0]
  })
  run.addEventListener('click', () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size < 20 * 1024 * 1024 || file.size > 25 * 1024 * 1024) {
      output.textContent = 'Choose a file between 20 MiB and the 25 MiB product limit.'
      return
    }
    run.disabled = true
    const startedAt = performance.now()
    const heapBefore = usedJsHeapBytes()
    output.textContent = `Uploading ${file.name} (${formatBytes(file.size)})\u2026`
    void api.uploadFile(file).then((attachment) => {
      const heapAfter = usedJsHeapBytes()
      const result = {
        status: 'passed',
        platform: window.Capacitor?.getPlatform?.() ?? 'unknown',
        bytes: file.size,
        durationMs: Math.round(performance.now() - startedAt),
        jsHeapBeforeBytes: heapBefore,
        jsHeapAfterBytes: heapAfter,
        jsHeapDeltaBytes: heapBefore == null || heapAfter == null ? null : heapAfter - heapBefore,
        uploadedKey: attachment.key ?? null,
      }
      output.textContent = JSON.stringify(result, null, 2)
      console.info('[mobile-upload-smoke] RESULT', result)
    }).catch((error: unknown) => {
      const result = {
        status: 'failed',
        platform: window.Capacitor?.getPlatform?.() ?? 'unknown',
        bytes: file.size,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      }
      output.textContent = JSON.stringify(result, null, 2)
      console.error('[mobile-upload-smoke] RESULT', result)
    }).finally(() => {
      run.disabled = false
    })
  })

  panel.append(title, input, run, output)
  document.body.appendChild(panel)
}
