
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

    if (caps.presignSupported) {
      // Step 1 — ask the server for a presigned PUT URL.
      const signed = await http<PresignResponse>('/uploads/presign', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, mime, size: file.size }),
      })
      // Step 2 — PUT the raw bytes directly to R2. No auth header; the
      // presigned URL carries everything the bucket needs.
      const r = await putPresignedFile(signed.uploadUrl, file, mime)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`R2 PUT failed: ${r.status} ${text.slice(0, 200)}`)
      }
      return {
        url: signed.publicUrl,
        key: signed.key,
        name: signed.name,
        mime: signed.mime,
        size: signed.size,
        kind: signed.kind === 'img' ? 'img' : 'file',
      }
    }

    // Local-storage fallback — base64 through the server.
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const dataBase64 = btoa(binary)
    return http<ApiAttachment>('/uploads', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, mime, dataBase64 }),
    })
  },
  refreshUploadUrl: (input: string | { url?: string; key?: string }) =>
    http<{ key: string; url: string }>('/uploads/refresh-url', {
      method: 'POST',
      body: JSON.stringify(typeof input === 'string' ? { url: input } : input),
    })
}
