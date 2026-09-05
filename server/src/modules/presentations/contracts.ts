import { z } from 'zod'

export const PRESENTATION_STATUSES = [
  'waitingForSources',
  'planning',
  'awaitingOutlineApproval',
  'generating',
  'validating',
  'ready',
  'needsAttention',
  'failed',
  'cancelled',
] as const
export const presentationStatusSchema = z.enum(PRESENTATION_STATUSES)
export type PresentationStatus = z.infer<typeof presentationStatusSchema>

export const PRESENTATION_VISIBILITY_SCOPES = ['PROJECT', 'PRIVATE'] as const
export const presentationVisibilityScopeSchema = z.enum(PRESENTATION_VISIBILITY_SCOPES)
export type PresentationVisibilityScope = z.infer<typeof presentationVisibilityScopeSchema>

export const PRESENTATION_JOB_KINDS = ['initial', 'outlineRevision', 'deckRevision'] as const
export const presentationJobKindSchema = z.enum(PRESENTATION_JOB_KINDS)
export type PresentationJobKind = z.infer<typeof presentationJobKindSchema>

export const PRESENTATION_JOB_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const
export const presentationJobStatusSchema = z.enum(PRESENTATION_JOB_STATUSES)
export type PresentationJobStatus = z.infer<typeof presentationJobStatusSchema>

export const PRESENTATION_PAGE_KINDS = ['opening', 'content', 'sources', 'closing'] as const
export const presentationPageKindSchema = z.enum(PRESENTATION_PAGE_KINDS)
export type PresentationPageKind = z.infer<typeof presentationPageKindSchema>

export const PRESENTATION_VISUAL_TYPES = [
  'diagram',
  'process',
  'timeline',
  'comparison',
  'chart',
  'formula',
  'system',
  'table',
  'image',
  'conceptMap',
] as const
export const presentationVisualTypeSchema = z.enum(PRESENTATION_VISUAL_TYPES)
export type PresentationVisualType = z.infer<typeof presentationVisualTypeSchema>

const identifierSchema = z.string().trim().min(1).max(240)
const boundedText = (max: number) => z.string().trim().min(1).max(max)

export const presentationSourceSnapshotItemSchema = z.object({
  sourceId: identifierSchema,
  title: boundedText(200),
  visibilityScope: presentationVisibilityScopeSchema,
  status: z.enum(['queued', 'processing', 'ready', 'failed']),
}).strict()
export type PresentationSourceSnapshotItem = z.infer<typeof presentationSourceSnapshotItemSchema>

export const sourceCoverageSchema = z.object({
  selectedSourceCount: z.number().int().nonnegative().max(40),
  readySourceCount: z.number().int().nonnegative().max(40),
  coveredSourceIds: z.array(identifierSchema).max(40),
  uncoveredSourceIds: z.array(identifierSchema).max(40),
  coverageRatio: z.number().min(0).max(1),
}).strict()
export type SourceCoverageV1 = z.infer<typeof sourceCoverageSchema>

export const pagePlanSchema = z.object({
  id: identifierSchema,
  pageNumber: z.number().int().min(1).max(40),
  kind: presentationPageKindSchema,
  title: boundedText(100),
  conclusion: z.string().trim().max(180),
  visualType: presentationVisualTypeSchema,
  evidenceIds: z.array(identifierSchema).max(24),
  sourceIds: z.array(identifierSchema).max(40),
  zoomPointCount: z.number().int().min(0).max(4),
}).strict()
export type PagePlanV1 = z.infer<typeof pagePlanSchema>

export const sectionPlanSchema = z.object({
  id: identifierSchema,
  title: boundedText(100),
  objective: boundedText(500),
  summary: boundedText(1_000),
  pages: z.array(pagePlanSchema).min(1).max(40),
}).strict()
export type SectionPlanV1 = z.infer<typeof sectionPlanSchema>

export const deckPlanSchema = z.object({
  schemaVersion: z.literal('deck_plan_v1'),
  title: boundedText(160),
  subtitle: z.string().trim().max(240),
  audience: boundedText(200),
  objective: boundedText(1_000),
  language: boundedText(32),
  targetPageCount: z.number().int().min(3).max(40),
  sourceCoverage: sourceCoverageSchema,
  sections: z.array(sectionPlanSchema).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  const pages = value.sections.flatMap((section) => section.pages)
  if (pages.length !== value.targetPageCount) {
    ctx.addIssue({ code: 'custom', message: 'outline page count must equal targetPageCount', path: ['sections'] })
  }
  pages.forEach((page, index) => {
    if (page.pageNumber !== index + 1) {
      ctx.addIssue({ code: 'custom', message: 'outline page numbers must be contiguous', path: ['sections'] })
    }
  })
})
export type DeckPlanV1 = z.infer<typeof deckPlanSchema>

export const evidenceItemSchema = z.object({
  schemaVersion: z.literal('evidence_item_v1'),
  id: identifierSchema,
  sourceId: identifierSchema,
  sourceTitle: boundedText(200),
  chunkId: identifierSchema,
  pageNumber: z.number().int().positive().nullable(),
  sectionTitle: z.string().trim().max(200).nullable(),
  excerpt: boundedText(2_000),
  claim: boundedText(500),
  marker: z.string().regex(/^S\d+$/),
  position: z.number().int().nonnegative(),
}).strict()
export type EvidenceItemV1 = z.infer<typeof evidenceItemSchema>

export const slideElementSchema = z.object({
  id: identifierSchema,
  label: boundedText(80),
  detail: z.string().trim().max(180),
  value: z.union([z.string().trim().max(80), z.number().finite()]).nullable(),
  group: z.string().trim().max(40).nullable(),
}).strict()
export type SlideElementV1 = z.infer<typeof slideElementSchema>

export const slideRelationSchema = z.object({
  from: identifierSchema,
  to: identifierSchema,
  label: z.string().trim().max(50),
}).strict()
export type SlideRelationV1 = z.infer<typeof slideRelationSchema>

export const slideAnchorSchema = z.object({
  id: identifierSchema,
  label: boundedText(60),
  targetElementId: identifierSchema,
  panel: z.object({
    observation: boundedText(240),
    reason: boundedText(240),
    meaning: boundedText(240),
  }).strict(),
}).strict()
export type SlideAnchorV1 = z.infer<typeof slideAnchorSchema>

export const contentIRSchema = z.object({
  schemaVersion: z.literal('content_ir_v1'),
  id: identifierSchema,
  pageNumber: z.number().int().min(1).max(40),
  kind: presentationPageKindSchema,
  headline: z.object({
    title: boundedText(100),
    conclusion: z.string().trim().max(180),
  }).strict(),
  visual: z.object({
    type: presentationVisualTypeSchema,
    sourceAssetId: identifierSchema.nullable(),
    elements: z.array(slideElementSchema).max(12),
    relations: z.array(slideRelationSchema).max(20),
  }).strict(),
  zooms: z.array(slideAnchorSchema).max(4),
  evidenceIds: z.array(identifierSchema).max(24),
  sourceMarkers: z.array(z.string().regex(/^S\d+$/)).max(24),
}).strict()
export type ContentIRV1 = z.infer<typeof contentIRSchema>

export const slideSpecSchema = z.object({
  schemaVersion: z.literal('slide_spec_v1'),
  id: identifierSchema,
  pageNumber: z.number().int().min(1).max(40),
  kind: presentationPageKindSchema,
  title: boundedText(100),
  conclusion: z.string().trim().max(180),
  visualType: presentationVisualTypeSchema,
  sourceAssetId: identifierSchema.nullable(),
  elements: z.array(slideElementSchema).max(12),
  relations: z.array(slideRelationSchema).max(20),
  anchors: z.array(slideAnchorSchema).max(4),
  evidenceIds: z.array(identifierSchema).max(24),
  sourceMarkers: z.array(z.string().regex(/^S\d+$/)).max(24),
}).strict()
export type SlideSpecV1 = z.infer<typeof slideSpecSchema>

export const qualityIssueSchema = z.object({
  schemaVersion: z.literal('quality_issue_v1'),
  severity: z.enum(['warning', 'error']),
  code: boundedText(80),
  message: boundedText(500),
  pageNumber: z.number().int().min(1).max(40).nullable(),
}).strict()
export type QualityIssueV1 = z.infer<typeof qualityIssueSchema>

export const lectureDeckManifestSchema = z.object({
  schemaVersion: z.literal('lecture_deck_manifest_v1'),
  title: boundedText(160),
  pageCount: z.number().int().min(3).max(40),
  stepCount: z.number().int().min(3).max(200),
  sourceCount: z.number().int().min(1).max(40),
  runtimeVersion: boundedText(80),
  rendererVersion: boundedText(80),
  generatedAt: z.string().datetime(),
}).strict()
export type LectureDeckManifestV1 = z.infer<typeof lectureDeckManifestSchema>

export const createPresentationRequestSchema = z.object({
  idempotencyKey: identifierSchema,
  title: boundedText(160).optional(),
  requirements: boundedText(4_000),
  sourceIds: z.array(identifierSchema).min(1).max(40).optional(),
  targetSlideCount: z.number().int().min(24).max(40).optional(),
  language: z.string().trim().min(2).max(32).optional(),
}).strict()

export const approvePresentationOutlineRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: identifierSchema.optional(),
}).strict()

export const revisePresentationOutlineRequestSchema = z.object({
  feedback: boundedText(4_000).optional(),
  targetSlideCount: z.number().int().min(3).max(40).optional(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: identifierSchema,
}).strict().superRefine((value, ctx) => {
  if (!value.feedback && value.targetSlideCount == null) {
    ctx.addIssue({
      code: 'custom',
      message: 'feedback or targetSlideCount is required for outline revision',
      path: ['feedback'],
    })
  }
})

export const revisePresentationRequestSchema = z.object({
  instruction: boundedText(4_000),
  scope: z.enum(['page', 'section', 'deck']),
  pageIds: z.array(identifierSchema).max(40).optional(),
  sectionIds: z.array(identifierSchema).max(20).optional(),
  idempotencyKey: identifierSchema,
}).strict().superRefine((value, ctx) => {
  if (value.scope === 'page' && !value.pageIds?.length) {
    ctx.addIssue({ code: 'custom', message: 'pageIds are required for page revision', path: ['pageIds'] })
  }
  if (value.scope === 'section' && !value.sectionIds?.length) {
    ctx.addIssue({ code: 'custom', message: 'sectionIds are required for section revision', path: ['sectionIds'] })
  }
})

export const retryPresentationRequestSchema = z.object({
  idempotencyKey: identifierSchema,
}).strict()

export type CreatePresentationInput = z.infer<typeof createPresentationRequestSchema>
export type ApprovePresentationOutlineInput = z.infer<typeof approvePresentationOutlineRequestSchema>
export type RevisePresentationOutlineInput = z.infer<typeof revisePresentationOutlineRequestSchema>
export type RevisePresentationInput = z.infer<typeof revisePresentationRequestSchema>

export interface PresentationVersionSummaryV1 {
  schemaVersion: 'presentation_version_v1'
  id: string
  versionNumber: number
  pageCount: number
  sizeBytes: number
  sha256: string
  runtimeVersion: string
  rendererVersion: string
  createdAt: string
}

export interface PresentationDetailV1 {
  schemaVersion: 'presentation_detail_v1'
  id: string
  title: string
  status: PresentationStatus
  visibilityScope: PresentationVisibilityScope
  requestText: string
  targetPageCount: number
  recommendedPageCount: number | null
  outlineRevision: number
  outline: DeckPlanV1 | null
  sourceSnapshot: PresentationSourceSnapshotItem[]
  latestVersion: PresentationVersionSummaryV1 | null
  error: string | null
  createdAt: string
  updatedAt: string
}
