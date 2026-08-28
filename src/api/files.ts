
import { http } from '@/api/core/http'
import { putPresignedFile } from './transport'
import type { ApiAttachment, UploadCapabilities, PresignResponse, } from './contracts'

export const filesApi = {
  uploadCapabilities: (() => {
    let cache: Promise<UploadCapabilities> | null = null
    return (): Promise<UploadCapabilities> => {
      // Cache the SUCCESSFUL probe only. If the request rejects (network
      // blip at boot, a transient 502, offline-then-online), drop the
      // cached promise so the next upload re-probes — otherwise a single
      // early failure poisons the cache and every subsequent image select
      // instantly throws "Failed to fetch" without ever hitting the wire,
      // until a full page reload.
      if (!cache) {
        cache = http<UploadCapabilities>('/uploads/capabilities').catch((err) => {
          cache = null
          throw err
        })
      }
      return cache
    }
  })(),
  uploadFile: async (file: File): Promise<ApiAttachment> => {
    const caps = await filesApi.uploadCapabilities()
    if (caps.maxBytes && file.size > caps.maxBytes) {
      throw new Error(`file too large: ${Math.round(file.size / 1024 / 1024)}MB (max ${Math.round(caps.maxBytes / 1024 / 1024)}MB)`)
    }
    const mime = file.type || 'application/octet-stream'
    if (caps.allowedMimes.length && !caps.allowedMimes.includes(mime)) {
      throw new Error(`file type not allowed: ${mime}`)
    }

    const signed = await http<PresignResponse>('/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, mime, size: file.size }),
    })
    const r = await putPresignedFile(signed.uploadUrl, file, mime)
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      throw new Error(`R2 PUT failed: ${r.status} ${text.slice(0, 200)}`)
    }
    return { url: signed.publicUrl, key: signed.key, name: signed.name, mime: signed.mime, size: signed.size, kind: signed.kind === 'img' ? 'img' : 'file' }
  },
  refreshUploadUrl: (input: string | { url?: string; key?: string }) =>
    http<{ key: string; url: string }>('/uploads/refresh-url', {
      method: 'POST',
      body: JSON.stringify(typeof input === 'string' ? { url: input } : input),
    })
}
