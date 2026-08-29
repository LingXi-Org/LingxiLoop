import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { Storage } from '../../storage.js'
import { normalizeStorageKey } from '../../storage.js'
import type { DependencyReadiness, UploadCapabilities } from './contracts.js'
import { MAX_UPLOAD_BYTES } from './contracts.js'
import { assertDatabaseReady } from './repository.js'

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
  agentOsHealth(): Promise<void>
  openNotebookEnabled(): boolean
  openNotebookHealth(): Promise<void>
  loadOpenGraph(url: string): Promise<unknown>
}

function timeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), milliseconds)),
  ])
}

export class PlatformApplication {
  constructor(private readonly infrastructure: PlatformInfrastructure) {}

  uploadCapabilities(): UploadCapabilities {
    return {
      mode: this.infrastructure.storage.mode,
      presignSupported: true,
      maxBytes: MAX_UPLOAD_BYTES,
      allowedMimes: Object.keys(MIME_POLICY),
    }
  }

  async presignUpload(companyId: string, input: { name: string; mime: string; size: number }) {
    const policy = MIME_POLICY[input.mime]
    if (!policy) throw new PlatformApplicationError('mime_not_allowed', `mime not allowed: ${input.mime}`)
    const id = randomUUID().replaceAll('-', '')
    const key = `attachments/${companyId}/${id}.${policy.ext}`
    const signed = await this.infrastructure.storage.presignPut(key, input.mime)
    return { ...signed, key, ...input, kind: policy.kind }
  }

  async refreshUploadUrl(requestedKey: string): Promise<{ key: string; url: string }> {
    const key = normalizeStorageKey(requestedKey)
    if (!key) throw new PlatformApplicationError('storage_key_invalid', 'native storage key required')
    return { key, url: await this.infrastructure.storage.publicUrl(key) }
  }

  async assertReady(): Promise<void> {
    await timeout(assertDatabaseReady(this.infrastructure.db), 1_000, 'health database check')
  }

  async dependencyReadiness(): Promise<DependencyReadiness> {
    const checks: DependencyReadiness = {
      database: false,
      redis: false,
      agentOs: false,
      openNotebook: !this.infrastructure.openNotebookEnabled(),
    }
    const probes: Array<Promise<void>> = [
      timeout(assertDatabaseReady(this.infrastructure.db), 2_000, 'database').then(() => { checks.database = true }),
      timeout(this.infrastructure.redisPing(), 2_000, 'redis').then(() => { checks.redis = true }),
      timeout(this.infrastructure.agentOsHealth(), 3_000, 'Agent OS').then(() => { checks.agentOs = true }),
    ]
    if (this.infrastructure.openNotebookEnabled()) {
      probes.push(timeout(this.infrastructure.openNotebookHealth(), 3_000, 'Open Notebook').then(() => {
        checks.openNotebook = true
      }))
    }
    await Promise.allSettled(probes)
    return checks
  }

  openGraph(url: string): Promise<unknown> {
    return this.infrastructure.loadOpenGraph(url)
  }
}
