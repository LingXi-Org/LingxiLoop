
import type { ApiAttachment } from '@/api/contracts'
import { ApiError, http } from '@/api/core/http'
import { putPresignedFile } from '@/api/transport'
import { UploadFailure } from '@/lib/uploadError'
import { useAuth } from '@/stores/auth'
import { canonicalUploadMime } from '../../../shared/upload-mime'
import type { PresignedUpload, UploadCapabilities } from './contracts'
import { uploadChecksum } from './upload-checksum'

const attempts = new WeakMap<File, Map<string, { key: string; pending?: Promise<ApiAttachment>; completed?: ApiAttachment }>>()

export const uploadsApi = {
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
  uploadFile: async (file: File, documentId?: string): Promise<ApiAttachment> => {
    const identity = useAuth.getState()
    const scope = JSON.stringify([identity.user?.id, identity.activeCompanyId, identity.authorizationEpoch, documentId])
    const assertIdentity = () => {
      const current = useAuth.getState()
      if (scope !== JSON.stringify([current.user?.id, current.activeCompanyId, current.authorizationEpoch, documentId])) throw new UploadFailure('identity_changed')
    }
    let contexts = attempts.get(file)
    if (!contexts) { contexts = new Map(); attempts.set(file, contexts) }
    let attempt = contexts.get(scope)
    if (!attempt) { attempt = { key: crypto.randomUUID() }; contexts.set(scope, attempt) }
    if (attempt.completed) { assertIdentity(); return attempt.completed }
    if (attempt.pending) return attempt.pending
    const upload = async (): Promise<ApiAttachment> => {
      const caps = await uploadsApi.uploadCapabilities()
      assertIdentity()
      if (file.size <= 0 || caps.maxBytes && file.size > caps.maxBytes) {
        throw new UploadFailure('file_size')
      }
      const mime = canonicalUploadMime(file.name, file.type)
      if (caps.allowedMimes.length && !caps.allowedMimes.includes(mime)) {
        throw new UploadFailure('file_type')
      }

      const sha256 = await uploadChecksum(file)
      assertIdentity()
      let signed: PresignedUpload
      try { signed = await http<PresignedUpload>('/uploads/presign', {
        method: 'POST',
        body: JSON.stringify({ name: file.name, mime, size: file.size, documentId, sha256, idempotencyKey: attempt!.key }),
      }) } catch (error) {
        if (error instanceof ApiError && [401, 403, 409].includes(error.status)) throw error
        throw new UploadFailure('upload_signing', error instanceof ApiError ? error.status : undefined)
      }
      assertIdentity()
      let r: Response
      try { r = await putPresignedFile(signed.uploadUrl, file, signed.mime) }
      catch { throw new UploadFailure('upload_interrupted') }
      assertIdentity()
      if (!r.ok) {
        throw new UploadFailure('upload_rejected', r.status)
      }
      return { url: signed.publicUrl, key: signed.key, name: signed.name, mime: signed.mime, size: signed.size, kind: signed.kind === 'img' ? 'img' : 'file' }
    }
    attempt.pending = upload()
    try { const result = await attempt.pending; assertIdentity(); attempt.completed = result; return result }
    finally { attempt.pending = undefined }
  },
  refreshUploadUrl: (input: { key: string }) =>
    http<{ key: string; url: string }>('/uploads/refresh-url', {
      method: 'POST',
      body: JSON.stringify(input),
    })
}
