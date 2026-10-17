import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { Storage } from '../../storage.js'
import { normalizeStorageKey } from '../../storage.js'
import type { DependencyReadiness, UploadCapabilities } from './contracts.js'
import { MAX_UPLOAD_BYTES } from './contracts.js'
import { assertDatabaseReady, registerUploadedFile } from './repository.js'

const MIME_POLICY: Record<string, { kind: 'img' | 'file'; ext: string }> = {
  'image/png': { kind: 'img', ext: 'png' },
  'image/jpeg': { kind: 'img', ext: 'jpg' },
  'image/webp': { kind: 'img', ext: 'webp' },
  'image/gif': { kind: 'img', ext: 'gif' },
  'application/pdf': { kind: 'file', ext: 'pdf' },
  'application/msword': { kind: 'file', ext: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'file', ext: 'docx' },
  'application/vnd.ms-excel': { kind: 'file', ext: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'file', ext: 'xlsx' },
  'application/vnd.ms-powerpoint': { kind: 'file', ext: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'file', ext: 'pptx' },
  'application/zip': { kind: 'file', ext: 'zip' },
  'application/x-tar': { kind: 'file', ext: 'tar' },
  'application/gzip': { kind: 'file', ext: 'gz' },
  'text/plain': { kind: 'file', ext: 'txt' },
  'text/markdown': { kind: 'file', ext: 'md' },
  'text/csv': { kind: 'file', ext: 'csv' },
  'application/json': { kind: 'file', ext: 'json' },
  'application/x-yaml': { kind: 'file', ext: 'yml' },
  'application/x-toml': { kind: 'file', ext: 'toml' },
  'audio/mpeg': { kind: 'file', ext: 'mp3' },
  'audio/wav': { kind: 'file', ext: 'wav' },
  'video/mp4': { kind: 'file', ext: 'mp4' },
  'video/quicktime': { kind: 'file', ext: 'mov' },
}

export type PlatformErrorCode = 'mime_not_allowed' | 'storage_key_invalid'

export class PlatformApplicationError extends Error {
  constructor(readonly code: PlatformErrorCode, message: string) {
    super(message)
  }
}

export interface PlatformInfrastructure {
  db: Queryable
  storage: Storage
  redisPing(): Promise<void>
  controlReady?(): Promise<void>
  openNotebookEnabled(): boolean
  openNotebookHealth(): Promise<void>
  loadOpenGraph(url: string): Promise<unknown>
}

async function timeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout`)), milliseconds) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

export class PlatformApplication {
  private readonly pending = new Map<string, Promise<void>>()
  private readyProbe?: Promise<{ database: boolean; redis: boolean; control: boolean }>

  // Retain the actual IO promise beyond a caller's deadline. A hung dependency
  // therefore occupies one probe, rather than adding work on every health poll.
  private probe(key: string, operation: () => Promise<void>, milliseconds: number): Promise<void> {
    let pending = this.pending.get(key)
    if (!pending) {
      pending = Promise.resolve().then(operation).finally(() => { this.pending.delete(key) })
      this.pending.set(key, pending)
    }
    return timeout(pending, milliseconds, key)
  }

  constructor(private readonly infrastructure: PlatformInfrastructure) {}

  uploadCapabilities(): UploadCapabilities {
    return {
      mode: this.infrastructure.storage.mode,
      presignSupported: true,
      maxBytes: MAX_UPLOAD_BYTES,
      allowedMimes: Object.keys(MIME_POLICY),
    }
  }

  async presignUpload(companyId: string, userId: string, input: { name: string; mime: string; size: number; documentId?: string }) {
    const policy = MIME_POLICY[input.mime]
    if (!policy) throw new PlatformApplicationError('mime_not_allowed', `mime not allowed: ${input.mime}`)
    const id = randomUUID().replaceAll('-', '')
    const key = `attachments/${companyId}/${id}.${policy.ext}`
    const signed = await this.infrastructure.storage.presignPut(key, input.mime, { contentLength: input.size })
    await registerUploadedFile(this.infrastructure.db, companyId, userId, key, input.documentId ?? null)
    return { ...signed, key, ...input, kind: policy.kind }
  }

  async refreshUploadUrl(companyId: string, requestedKey: string): Promise<{ key: string; url: string }> {
    const key = normalizeStorageKey(requestedKey)
    if (!key || !key.startsWith(`attachments/${companyId}/`)) {
      throw new PlatformApplicationError('storage_key_invalid', 'workspace attachment key required')
    }
    return { key, url: await this.infrastructure.storage.publicUrl(key) }
  }

  async assertReady(): Promise<void> {
    await Promise.all([
      this.probe('database', () => assertDatabaseReady(this.infrastructure.db), 1_000),
      this.probe('redis', () => this.infrastructure.redisPing(), 1_000),
    ])
  }

  readiness(): Promise<{ database: boolean; redis: boolean; control: boolean }> {
    this.readyProbe ??= Promise.all([
      this.probe('database', () => assertDatabaseReady(this.infrastructure.db), 1_000),
      this.probe('redis', () => this.infrastructure.redisPing(), 1_000),
      this.probe('control', async () => {
        if (!this.infrastructure.controlReady) throw new Error('control probe not configured')
        await this.infrastructure.controlReady()
      }, 3_000),
    ].map(async (probe) => { try { await probe; return true } catch { return false } }))
      .then(([database, redis, control]) => ({ database, redis, control }))
      .finally(() => { this.readyProbe = undefined })
    return this.readyProbe
  }

  async dependencyReadiness(): Promise<DependencyReadiness> {
    const [required, notebook] = await Promise.all([
      this.readiness(),
      this.infrastructure.openNotebookEnabled()
        ? this.probe('openNotebook', () => this.infrastructure.openNotebookHealth(), 30_000)
          .then(() => true, () => false)
        : Promise.resolve(true),
    ])
    return { ...required, openNotebook: notebook }
  }

  openGraph(url: string): Promise<unknown> {
    return this.infrastructure.loadOpenGraph(url)
  }
}
