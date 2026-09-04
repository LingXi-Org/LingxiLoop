export const PRESENTATION_DETAIL_SCHEMA_VERSION = 'presentation_detail_v1' as const
export const DECK_PLAN_SCHEMA_VERSION = 'deck_plan_v1' as const
export const PRESENTATION_VERSION_SCHEMA_VERSION = 'presentation_version_v1' as const
export const PRESENTATION_VERSION_LIST_SCHEMA_VERSION = 'presentation_version_list_v1' as const

export type PresentationStatus =
  | 'waitingForSources'
  | 'planning'
  | 'awaitingOutlineApproval'
  | 'generating'
  | 'validating'
  | 'ready'
  | 'needsAttention'
  | 'failed'
  | 'cancelled'

export type PresentationVisibilityScope = 'PROJECT' | 'PRIVATE'

export type PresentationPageKind = 'opening' | 'content' | 'sources' | 'closing'

export type PresentationVisualType =
  | 'diagram'
  | 'process'
  | 'timeline'
  | 'comparison'
  | 'chart'
  | 'formula'
  | 'system'
  | 'table'
  | 'image'
  | 'conceptMap'

export interface PresentationSourceSnapshotV1 {
  sourceId: string
  title: string
  visibilityScope: PresentationVisibilityScope
}

export interface PagePlanV1 {
  id: string
  pageNumber: number
  kind: PresentationPageKind
  title: string
  conclusion: string
  visualType: PresentationVisualType
  evidenceIds: string[]
  sourceIds: string[]
  zoomPointCount: number
}

export interface SectionPlanV1 {
  id: string
  title: string
  objective: string
  summary: string
  pages: PagePlanV1[]
}

export interface DeckPlanV1 {
  schemaVersion: typeof DECK_PLAN_SCHEMA_VERSION
  title: string
  subtitle: string
  audience: string
  objective: string
  language: string
  targetPageCount: number
  sourceCoverage: {
    selectedSourceCount: number
    readySourceCount: number
    coveredSourceIds: string[]
    uncoveredSourceIds: string[]
    coverageRatio: number
  }
  sections: SectionPlanV1[]
}

export interface QualityIssueV1 {
  code: string
  severity: 'warning' | 'error'
  message: string
  pageId?: string | null
}

export interface PresentationQualityReportV1 {
  schemaVersion: 'presentation_quality_report_v1'
  evidenceCoverageRatio: number
  sourceCoverageRatio: number
  duplicatePageRatio: number
  issues: QualityIssueV1[]
}

export interface PresentationVersionSummaryV1 {
  schemaVersion: typeof PRESENTATION_VERSION_SCHEMA_VERSION
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
  schemaVersion: typeof PRESENTATION_DETAIL_SCHEMA_VERSION
  id: string
  title: string
  status: PresentationStatus
  visibilityScope: PresentationVisibilityScope
  requestText: string
  targetPageCount: number
  recommendedPageCount: number | null
  outlineRevision: number
  outline: DeckPlanV1 | null
  sourceSnapshot: PresentationSourceSnapshotV1[]
  latestVersion: PresentationVersionSummaryV1 | null
  qualityReport?: PresentationQualityReportV1 | null
  progress?: number | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface PresentationVersionListV1 {
  schemaVersion: typeof PRESENTATION_VERSION_LIST_SCHEMA_VERSION
  versions: PresentationVersionSummaryV1[]
}

export interface PresentationResourceV1 {
  presentation: PresentationDetailV1
  versions: PresentationVersionSummaryV1[]
}

export interface PresentationArtifactDescriptor {
  artifactId: string
  artifactKind: 'lecture_deck_html'
  title: string
}

const PRESENTATION_STATUSES = new Set<PresentationStatus>([
  'waitingForSources',
  'planning',
  'awaitingOutlineApproval',
  'generating',
  'validating',
  'ready',
  'needsAttention',
  'failed',
  'cancelled',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireSchemaVersion(
  value: Record<string, unknown>,
  expected: string,
  resourceName: string,
): void {
  if (value.schemaVersion !== expected) {
    throw new Error(`${resourceName}版本不受支持`)
  }
}

function assertDeckPlan(value: unknown): asserts value is DeckPlanV1 {
  if (!isRecord(value)) throw new Error('演示大纲格式无效')
  requireSchemaVersion(value, DECK_PLAN_SCHEMA_VERSION, '演示大纲')
  if (!Array.isArray(value.sections)) throw new Error('演示大纲缺少章节')
}

function assertVersion(value: unknown): asserts value is PresentationVersionSummaryV1 {
  if (!isRecord(value)) throw new Error('演示版本格式无效')
  requireSchemaVersion(value, PRESENTATION_VERSION_SCHEMA_VERSION, '演示版本')
}

export function parsePresentationDetail(value: unknown): PresentationDetailV1 {
  const candidate = isRecord(value) && isRecord(value.presentation) ? value.presentation : value
  if (!isRecord(candidate)) throw new Error('演示详情格式无效')
  requireSchemaVersion(candidate, PRESENTATION_DETAIL_SCHEMA_VERSION, '演示详情')
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') {
    throw new Error('演示详情缺少标识或标题')
  }
  if (typeof candidate.status !== 'string' || !PRESENTATION_STATUSES.has(candidate.status as PresentationStatus)) {
    throw new Error('演示状态不受支持')
  }
  if (candidate.outline !== null) assertDeckPlan(candidate.outline)
  if (candidate.latestVersion !== null) assertVersion(candidate.latestVersion)
  return candidate as unknown as PresentationDetailV1
}

export function parsePresentationVersionList(value: unknown): PresentationVersionListV1 {
  if (!isRecord(value)) throw new Error('演示版本列表格式无效')
  requireSchemaVersion(value, PRESENTATION_VERSION_LIST_SCHEMA_VERSION, '演示版本列表')
  if (!Array.isArray(value.versions)) throw new Error('演示版本列表格式无效')
  value.versions.forEach(assertVersion)
  return value as unknown as PresentationVersionListV1
}

export function parsePresentationArtifact(value: unknown): PresentationArtifactDescriptor | null {
  if (!isRecord(value)) return null
  const artifact = isRecord(value.artifact) ? value.artifact : value
  if (artifact.artifactKind !== 'lecture_deck_html' || typeof artifact.artifactId !== 'string') return null
  return {
    artifactId: artifact.artifactId,
    artifactKind: 'lecture_deck_html',
    title: typeof artifact.title === 'string' && artifact.title.trim() ? artifact.title : 'HTML 演示',
  }
}

export function isPresentationActive(status: PresentationStatus): boolean {
  return status === 'waitingForSources'
    || status === 'planning'
    || status === 'generating'
    || status === 'validating'
}

export const PRESENTATION_STATUS_LABELS: Record<PresentationStatus, string> = {
  waitingForSources: '等待资料',
  planning: '正在规划',
  awaitingOutlineApproval: '等待确认大纲',
  generating: '正在生成',
  validating: '正在检查',
  ready: '可以播放',
  needsAttention: '需要处理',
  failed: '生成失败',
  cancelled: '已取消',
}

export const PRESENTATION_VISUAL_LABELS: Record<PresentationVisualType, string> = {
  diagram: '关系图',
  process: '流程图',
  timeline: '时间线',
  comparison: '对比图',
  chart: '数据图表',
  formula: '公式图解',
  system: '系统图',
  table: '表格',
  image: '资料图片',
  conceptMap: '概念图',
}
