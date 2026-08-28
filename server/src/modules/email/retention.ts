import type { StorageObject } from '../../storage.js'

export const EMAIL_ATTACHMENT_STORAGE_PREFIX = 'email-attachments/'
export const EMAIL_ATTACHMENT_SAFETY_AGE_MS = 60 * 60_000

export function pickEmailAttachmentOrphans(args: {
  inStorage: StorageObject[]
  inDb: Set<string>
  nowMs: number
  safetyAgeMs?: number
}): string[] {
  const cutoff = args.nowMs - (args.safetyAgeMs ?? EMAIL_ATTACHMENT_SAFETY_AGE_MS)
  return args.inStorage
    .filter((object) => !args.inDb.has(object.key) && object.lastModifiedMs <= cutoff)
    .map((object) => object.key)
}
