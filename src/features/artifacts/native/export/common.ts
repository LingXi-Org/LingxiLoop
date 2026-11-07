import { validateArtifactDocument, type ArtifactDocument, type ArtifactAsset } from '../../../../../shared/artifact-document'
import type { ArtifactExportOptions } from '../export-artifact'

export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
export const exportFilename = (title: string, extension: string) => `${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || '文稿'}.${extension}`

export async function blobDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768))
  signal?.throwIfAborted()
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

export class ExportResources {
  readonly document: ArtifactDocument
  readonly warnings = new Set<string>()
  private assets = new Map<string, Promise<string>>()
  constructor(document: ArtifactDocument, readonly options: ArtifactExportOptions) { this.document = validateArtifactDocument(document) }
  async asset(id: string): Promise<string> {
    const current = this.assets.get(id)
    if (current) return current
    const asset = this.document.assets[id]
    if (!asset) throw new Error(`导出资源不存在：${id}`)
    const pending = this.loadAsset(asset)
    this.assets.set(id, pending)
    try { return await pending } catch (error) { this.assets.delete(id); throw error }
  }
  private async loadAsset(asset: ArtifactAsset) {
    this.options.signal?.throwIfAborted()
    const url = new URL(asset.url, typeof window === 'undefined' ? 'http://localhost' : window.location.href)
    if (!this.options.resolveAsset && url.pathname.startsWith('/api/')) throw new Error('受保护资源需要当前文档的授权读取器')
    const blob = this.options.resolveAsset ? await this.options.resolveAsset(asset, this.options.signal) : await fetch(asset.url, { signal: this.options.signal, credentials: 'omit', redirect: 'error' }).then(async response => {
      if (!response.ok) throw new Error(`导出资源加载失败 (${response.status})：${asset.id}`)
      return response.blob()
    })
    const mime = blob.type.split(';')[0]!.toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(mime)) throw new Error(`不是可导出的图片资源：${asset.id}`)
    const bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer())
    const prefix = new TextDecoder().decode(bytes)
    const valid = mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
      : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === 'image/webp' ? prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
      : mime === 'image/gif' ? /^GIF8[79]a/.test(prefix)
      : /^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/.test(prefix)
    if (!valid) throw new Error(`图片内容与类型不一致：${asset.id}`)
    return blobDataUrl(blob, this.options.signal)
  }
  check() { this.options.signal?.throwIfAborted() }
  progress(completed: number) { this.check(); this.options.onProgress?.(completed, this.document.pageOrder.length) }
  dispose() { this.assets.clear() }
}

let mathCssPromise: Promise<string> | undefined
/** Font URLs are copied into the export, so offline opening never depends on the app origin. */
export function offlineMathCss(signal?: AbortSignal): Promise<string> {
  if (!mathCssPromise) mathCssPromise = (async () => {
    const { default: url } = await import('katex/dist/katex.min.css?url')
    const response = await fetch(url)
    if (!response.ok) throw new Error('公式样式加载失败')
    let css = await response.text()
    const matches = [...css.matchAll(/url\((?:"|')?([^)'"\s]+)(?:"|')?\)/g)]
    for (const [original, relative] of matches) {
      if (!relative || relative.startsWith('data:')) continue
      const font = await fetch(new URL(relative, new URL(url, window.location.href)))
      if (!font.ok) throw new Error('公式字体加载失败')
      css = css.replace(original, `url("${await blobDataUrl(await font.blob())}")`)
    }
    return css
  })().catch(error => { mathCssPromise = undefined; throw error })
  signal?.throwIfAborted()
  return mathCssPromise.then(css => { signal?.throwIfAborted(); return css })
}
