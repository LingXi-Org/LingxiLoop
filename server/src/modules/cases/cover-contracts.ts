import { createHash } from 'node:crypto'
import type { CaseContent } from './contracts.js'

export const CASE_COVER_RULES_VERSION = 'hairline-37d2e78dcb333ab30c3338e28ed4a690364ea014-adapter-v1'
export type CoverSnapshotKind = 'draft' | 'published'
export interface GeneratedCaseCover {
  schemaVersion: 1
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'cancelled'
  fingerprint: string
  generation: number
  alt: string | null
  previewUrl: string | null
  interactiveUrl: string | null
  canRetry: boolean
}
export interface CaseCoverSnapshot { title: string; summary: string; category: string; tags: string[]; content: string }
export interface CaseCoverGenerationInput {
  organizationId: string; caseId: string; jobId: string; fingerprint: string
  generation: number; requestedBy: string; snapshot: CaseCoverSnapshot; signal: AbortSignal
}
export interface CaseCoverGenerationResult {
  objectName: string; rationale: string; altText: string; html: string; staticSvg: string
  sourceVersion: string; metadata: Record<string, unknown>
}
export function caseCoverSnapshot(content: CaseContent): CaseCoverSnapshot {
  // Projection is validated alongside native document at the write boundary.
  // Native block identities, legacy representation and manual cover are not content identity.
  return { title: content.title.trim(), summary: content.summary.trim(), category: content.category.trim(),
    tags: [...new Set(content.tags)].sort(), content: content.body.trim() }
}
export function caseCoverFingerprint(snapshot: CaseCoverSnapshot): string {
  return createHash('sha256').update(JSON.stringify([CASE_COVER_RULES_VERSION, snapshot.title,
    snapshot.summary, snapshot.category, snapshot.tags, snapshot.content])).digest('hex')
}
