export type AttachmentPreviewKind = 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'download'
export interface AttachmentPreviewDescriptor {
  name: string
  kind: 'img' | 'pdf' | 'file' | 'fig'
  url: string
  key?: string
  mime?: string
  size?: number
}
export type TextPreviewFormat = 'markdown' | 'json' | 'plain'
export type JsonPreviewTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'plain'
export type JsonPreviewToken = { value: string; kind: JsonPreviewTokenKind }
export type AttachmentPreviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; url: string; text?: string }
  | { status: 'error'; message: string }

export const PDF_PREVIEW_MAX_BYTES = 25 * 1024 * 1024
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log', 'yaml', 'yml'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'])

export function inferAttachmentPreview(attachment: AttachmentPreviewDescriptor): AttachmentPreviewKind {
  const mime = (attachment.mime ?? '').split(';')[0].trim().toLocaleLowerCase()
  const extension = attachment.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  if (attachment.kind === 'img' || mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (attachment.kind === 'pdf' || mime === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/csv' || TEXT_EXTENSIONS.has(extension)) return 'text'
  return 'download'
}

export async function readTextPreview(response: Response, maxBytes = TEXT_PREVIEW_MAX_BYTES): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error('文件超过 2 MB 文本预览上限')
  if (!response.ok) throw new Error(`文件加载失败（${response.status}）`)
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('文件超过 2 MB 文本预览上限')
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('文件超过 2 MB 文本预览上限')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

export function formatTextPreview(name: string, source: string): string {
  const extension = name.split('.').pop()?.toLocaleLowerCase()
  if (extension !== 'json') return source
  try { return JSON.stringify(JSON.parse(source), null, 2) } catch { return source }
}

export function inferTextPreviewFormat(name: string): TextPreviewFormat {
  const extension = name.split('.').pop()?.toLocaleLowerCase()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'json') return 'json'
  return 'plain'
}

export function tokenizeJsonPreview(source: string): JsonPreviewToken[] {
  const expression = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g
  const tokens: JsonPreviewToken[] = []
  let cursor = 0
  for (const match of source.matchAll(expression)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ value: source.slice(cursor, index), kind: 'plain' })
    const value = match[0]
    const tail = source.slice(index + value.length)
    const kind: JsonPreviewTokenKind = value.startsWith('"')
      ? (/^\s*:/.test(tail) ? 'key' : 'string')
      : value === 'null' ? 'null'
        : value === 'true' || value === 'false' ? 'boolean'
          : 'number'
    tokens.push({ value, kind })
    cursor = index + value.length
  }
  if (cursor < source.length) tokens.push({ value: source.slice(cursor), kind: 'plain' })
  return tokens
}
