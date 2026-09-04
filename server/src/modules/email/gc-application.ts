import type { StorageObject } from '../../storage.js'
import { EMAIL_ATTACHMENT_STORAGE_PREFIX, pickEmailAttachmentOrphans } from './retention.js'

interface EmailGcDependencies {
  listStorage(prefix: string): Promise<StorageObject[]>
  listReferencedKeys(): Promise<Set<string>>
  deleteObject(key: string): Promise<boolean>
  metric(name: 'email.gc.deleted' | 'email.gc.failed'): void
  now(): number
}

export class EmailGcApplication {
  constructor(private readonly dependencies: EmailGcDependencies) {}

  async run(): Promise<{ inspected: number; deleted: number; failed: number }> {
    const [inStorage, inDb] = await Promise.all([
      this.dependencies.listStorage(EMAIL_ATTACHMENT_STORAGE_PREFIX),
      this.dependencies.listReferencedKeys(),
    ])
    const orphans = pickEmailAttachmentOrphans({
      inStorage,
      inDb,
      nowMs: this.dependencies.now(),
    })
    let deleted = 0
    let failed = 0
    for (const key of orphans) {
      if (await this.dependencies.deleteObject(key)) {
        deleted += 1
        this.dependencies.metric('email.gc.deleted')
      } else {
        failed += 1
        this.dependencies.metric('email.gc.failed')
      }
    }
    return { inspected: inStorage.length, deleted, failed }
  }
}
