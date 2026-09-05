import { createHash } from 'node:crypto'
import {
  type ContentIRV1,
  type DeckPlanV1,
  type EvidenceItemV1,
  type PagePlanV1,
  type PresentationSourceSnapshotItem,
  type QualityIssueV1,
  type SlideSpecV1,
  deckPlanSchema,
  slideSpecSchema,
} from './contracts.js'
import { ContentGenerationError } from './errors.js'
import { calculateSourceCoverage, validateDeckPlan, validateSlideSpecs } from './validator.js'

export interface PresentationMaterialV1 {
  schemaVersion: 'presentation_material_v1'
  sourceId: string
  title: string
  blocks: Array<{
    chunkId: string
    ordinal: number
    text: string
    pageNumber: number | null
    sectionTitle: string | null
  }>
  assets: Array<{
    assetId: string
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
    dataUri: string
    pageNumber: number | null
    sectionTitle: string | null
    width: number | null
    height: number | null
  }>
  truncated: boolean
}

export interface PresentationSourceAssetV1 {
  sourceId: string
  assetId: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUri: string
  pageNumber: number | null
  sectionTitle: string | null
  width: number | null
  height: number | null
}

export type PresentationSourceAssetMetadataV1 = Omit<PresentationSourceAssetV1, 'dataUri'>

export interface PresentationJsonModel {
  complete(input: {
    purpose: 'presentation.plan' | 'presentation.page' | 'presentation.critic' | 'presentation.repair'
    companyId: string
    conversationId: string
    presentationId: string
    jobId: string
    pageId?: string
    system: string
    user: string
  }): Promise<unknown>
}

function stableId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}-${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 20)}`
}

function claimFromText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const end = normalized.search(/[。！？.!?]\s/)
  return (end > 20 ? normalized.slice(0, end + 1) : normalized).slice(0, 500)
}

interface EvidenceCandidate {
  material: PresentationMaterialV1
  materialIndex: number
  block: PresentationMaterialV1['blocks'][number]
  relevance: number
}

function searchTerms(value: string): Set<string> {
  const normalized = value.normalize('NFKC').toLocaleLowerCase()
  const terms = new Set(normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [])
  for (const sequence of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let index = 0; index < sequence.length - 1; index++) terms.add(sequence.slice(index, index + 2))
  }
  return terms
}

function relevanceScore(candidate: EvidenceCandidate, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return 0
  const blockTerms = searchTerms(`${candidate.block.sectionTitle ?? ''} ${candidate.block.text}`)
  let score = 0
  for (const term of queryTerms) if (blockTerms.has(term)) score += term.length >= 4 ? 3 : 1
  return score
}

function candidateOrder(left: EvidenceCandidate, right: EvidenceCandidate): number {
  return right.relevance - left.relevance
    || left.materialIndex - right.materialIndex
    || left.block.ordinal - right.block.ordinal
    || left.block.chunkId.localeCompare(right.block.chunkId)
}

function diversityKey(candidate: EvidenceCandidate): string {
  const location = candidate.block.pageNumber != null
    ? `page:${candidate.block.pageNumber}`
    : candidate.block.sectionTitle?.trim().toLocaleLowerCase() || `band:${Math.floor(candidate.block.ordinal / 4)}`
  return `${candidate.material.sourceId}\u0000${location}`
}

export function buildEvidenceLedger(
  materials: PresentationMaterialV1[],
  context: { title?: string; requirements?: string } = {},
): EvidenceItemV1[] {
  const queryTerms = searchTerms(`${context.title ?? ''} ${context.requirements ?? ''}`)
  const candidates = materials.flatMap((material, materialIndex) => material.blocks
    .filter((block) => block.text.trim().length >= 20)
    .map((block) => ({ material, materialIndex, block, relevance: 0 })))
  for (const candidate of candidates) candidate.relevance = relevanceScore(candidate, queryTerms)
  const ranked = [...candidates].sort(candidateOrder)
  const selected: EvidenceCandidate[] = []
  const selectedKeys = new Set<string>()
  const add = (candidate: EvidenceCandidate) => {
    const key = `${candidate.material.sourceId}\u0000${candidate.block.chunkId}`
    if (selected.length >= 80 || selectedKeys.has(key)) return false
    selectedKeys.add(key)
    selected.push(candidate)
    return true
  }

  // Round 1: reserve one relevance-ranked candidate per source before any source
  // can consume the bounded ledger. This preserves 40-source coverage at cap 80.
  for (const material of materials) {
    const sourceCandidates = ranked.filter((candidate) => candidate.material.sourceId === material.sourceId)
    const best = sourceCandidates[0]
    if (best) add(best)
  }
  // Round 2: global title/request relevance without allowing it to exhaust all
  // diversity capacity.
  const relevanceLimit = Math.min(60, Math.max(20, materials.length))
  for (const candidate of ranked) {
    if (selected.length >= relevanceLimit) break
    add(candidate)
  }
  // Round 3: page/section diversity before filling the remaining relevance-ranked slots.
  const diversityBuckets = new Set(selected.map(diversityKey))
  for (const candidate of candidates.sort((left, right) => left.materialIndex - right.materialIndex
    || left.block.ordinal - right.block.ordinal || left.block.chunkId.localeCompare(right.block.chunkId))) {
    if (selected.length >= 70) break
    const bucket = diversityKey(candidate)
    if (diversityBuckets.has(bucket)) continue
    diversityBuckets.add(bucket)
    add(candidate)
  }
  // Round 4: give sources a second candidate where capacity remains, then fill
  // any final slots by global relevance.
  for (const material of materials) {
    const sourceCandidates = ranked.filter((candidate) => candidate.material.sourceId === material.sourceId)
    const selectedForSource = selected.filter((candidate) => candidate.material.sourceId === material.sourceId).length
    if (selectedForSource >= 2) continue
    const second = sourceCandidates.find((candidate) => !selectedKeys.has(`${candidate.material.sourceId}\u0000${candidate.block.chunkId}`))
    if (second) add(second)
  }
  for (const candidate of ranked) add(candidate)

  const sourceMarker = new Map(materials.map((material, index) => [material.sourceId, `S${index + 1}`]))
  return selected.map(({ material, block }, position) => ({
    schemaVersion: 'evidence_item_v1',
    id: stableId('pe', material.sourceId, block.chunkId),
    sourceId: material.sourceId,
    sourceTitle: material.title.slice(0, 200),
    chunkId: block.chunkId,
    pageNumber: block.pageNumber,
    sectionTitle: block.sectionTitle?.slice(0, 200) ?? null,
    excerpt: block.text.replace(/`/g, '').trim().slice(0, 2_000),
    claim: claimFromText(block.text),
    marker: sourceMarker.get(material.sourceId)!,
    position,
  }))
}

export function buildSourceAssetCatalog(materials: PresentationMaterialV1[]): PresentationSourceAssetV1[] {
  const catalog: PresentationSourceAssetV1[] = []
  const seen = new Set<string>()
  for (const material of materials) {
    let sourceAssetCount = 0
    for (const asset of material.assets) {
      if (sourceAssetCount >= 4 || catalog.length >= 160) break
      if (asset.mimeType === 'image/svg+xml') continue
      const localAssetId = stableId('pa', material.sourceId, asset.assetId)
      if (seen.has(localAssetId)) continue
      seen.add(localAssetId)
      catalog.push({
        sourceId: material.sourceId,
        assetId: localAssetId,
        mimeType: asset.mimeType,
        dataUri: asset.dataUri,
        pageNumber: asset.pageNumber,
        sectionTitle: asset.sectionTitle,
        width: asset.width,
        height: asset.height,
      })
      sourceAssetCount++
    }
  }
  return catalog
}

export function recommendedPageCount(evidenceCount: number, targetPageCount: number): number {
  return Math.min(targetPageCount, Math.max(3, Math.floor(evidenceCount * 1.5) + 3))
}

function evidencePrompt(evidence: EvidenceItemV1[]): string {
  return evidence.map((item) =>
    `${item.id} [${item.marker}] ${item.sourceTitle}` +
    `${item.pageNumber ? ` p.${item.pageNumber}` : ''}${item.sectionTitle ? ` / ${item.sectionTitle}` : ''}\n` +
    `${item.claim}\n${item.excerpt.slice(0, 260)}`,
  ).join('\n\n')
}

function outlineSystem(): string {
  return `你是严谨的长篇课程演示总编。只依据 Evidence Ledger，不得补充外部事实。
输出一个 JSON 对象，必须严格符合 deck_plan_v1。正文页一页一个结论、一个主视觉、2–4 个 zoom；
开场必须是第 1 页，来源索引必须是倒数第 2 页，结尾必须是最后 1 页。pageNumber 连续，页面总数精确匹配 targetPageCount。
正文页 evidenceIds/sourceIds 只能使用 Ledger 中存在的 ID；zoomPointCount 为 2–4。禁止 markdown 和解释文字。`
}

function ensureOutlineEvidence(
  plan: DeckPlanV1,
  evidence: EvidenceItemV1[],
  sources: PresentationSourceSnapshotItem[],
  assets: PresentationSourceAssetMetadataV1[],
): QualityIssueV1[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const evidenceIds = new Set(evidenceById.keys())
  const sourceIds = new Set(evidence.map((item) => item.sourceId))
  const issues = validateDeckPlan(plan, sources.map((source) => source.sourceId))
  for (const page of plan.sections.flatMap((section) => section.pages)) {
    for (const id of page.evidenceIds) {
      if (!evidenceIds.has(id)) issues.push({ schemaVersion: 'quality_issue_v1', severity: 'error', code: 'outline.unknownEvidence', message: `Unknown evidence id: ${id}`, pageNumber: page.pageNumber })
      const item = evidenceById.get(id)
      if (item && !page.sourceIds.includes(item.sourceId)) {
        issues.push({ schemaVersion: 'quality_issue_v1', severity: 'error', code: 'outline.evidenceSourceMismatch', message: `Evidence ${id} is not bound to its source`, pageNumber: page.pageNumber })
      }
    }
    for (const id of page.sourceIds) {
      if (!sourceIds.has(id)) issues.push({ schemaVersion: 'quality_issue_v1', severity: 'error', code: 'outline.unknownSource', message: `Unknown source id: ${id}`, pageNumber: page.pageNumber })
    }
    if (page.kind === 'content' && page.visualType === 'image'
      && !assets.some((asset) => page.sourceIds.includes(asset.sourceId))) {
      issues.push({ schemaVersion: 'quality_issue_v1', severity: 'error', code: 'outline.imageWithoutAsset', message: 'Image pages require a source-owned image asset', pageNumber: page.pageNumber })
    }
  }
  return issues
}

export async function generateDeckPlan(input: {
  model: PresentationJsonModel
  companyId: string
  conversationId: string
  presentationId: string
  jobId: string
  title: string
  requirements: string
  language: string
  targetPageCount: number
  sources: PresentationSourceSnapshotItem[]
  evidence: EvidenceItemV1[]
  assets?: PresentationSourceAssetMetadataV1[]
  previousPlan?: DeckPlanV1
  feedback?: string
}): Promise<DeckPlanV1> {
  let repair = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await input.model.complete({
      purpose: attempt === 0 ? 'presentation.plan' : 'presentation.repair',
      companyId: input.companyId,
      conversationId: input.conversationId,
      presentationId: input.presentationId,
      jobId: input.jobId,
      system: outlineSystem(),
      user: `标题：${input.title}\n语言：${input.language}\n目标页数：${input.targetPageCount}\n用户要求：${input.requirements}\n` +
        `资料：${input.sources.map((source) => `${source.sourceId}:${source.title}`).join('；')}\n` +
        `源内图片目录（仅元数据；无匹配项时不得规划 image 页）：${JSON.stringify(input.assets ?? [])}\n` +
        `${input.previousPlan ? `待修订大纲：${JSON.stringify(input.previousPlan)}\n反馈：${input.feedback ?? ''}\n` : ''}` +
        `${repair}\nEvidence Ledger:\n${evidencePrompt(input.evidence)}`,
    })
    const parsed = deckPlanSchema.safeParse(raw)
    const candidate = parsed.success ? {
      ...parsed.data,
      sourceCoverage: calculateSourceCoverage(parsed.data, input.sources.map((source) => source.sourceId)),
    } : null
    const issues = candidate ? ensureOutlineEvidence(candidate, input.evidence, input.sources, input.assets ?? []) : []
    if (candidate && issues.length === 0) return candidate
    repair = `上次输出未通过：${parsed.success ? issues.map((item) => item.message).join('；') : parsed.error.issues.map((item) => item.message).join('；')}。请完整重写。`
  }
  throw new ContentGenerationError('大纲在两轮定向修复后仍未通过结构、来源或覆盖率门禁。')
}

function specialSlide(page: PagePlanV1, evidence: EvidenceItemV1[]): SlideSpecV1 {
  const sourceMarkers = page.kind === 'sources' ? [...new Set(evidence.map((item) => item.marker))] : []
  return {
    schemaVersion: 'slide_spec_v1', id: page.id, pageNumber: page.pageNumber, kind: page.kind,
    title: page.title, conclusion: page.conclusion, visualType: page.visualType,
    sourceAssetId: null, elements: [], relations: [], anchors: [], evidenceIds: [], sourceMarkers,
  }
}

function pageSystem(): string {
  return `你是课程演示的单页内容设计师。只输出严格的 slide_spec_v1 JSON，不得输出 HTML/CSS/JS/markdown。
只使用给定 Evidence；每个事实必须由 evidenceIds 和 sourceMarkers 绑定。elements 为 2–12 个短标签节点，relations 只引用已有 element id。
anchors 必须 2–4 个且 targetElementId 存在；每个讲解面板严格包含 observation、reason、meaning。
标题、结论与节点标签合计须控制在 110 个可见单位以内。evidenceIds 应覆盖本页计划给出的全部 Evidence，
sourceMarkers 必须与所引用 Evidence 的 marker 精确对应。visualType=image 时 sourceAssetId 必须选自给定目录，
且 elements 只能有 2–4 个；其他视觉类型 sourceAssetId 必须为 null。不得编造图片、数值、日期、专名或来源。`
}

export function contentIRFromSlideSpec(spec: SlideSpecV1): ContentIRV1 {
  return {
    schemaVersion: 'content_ir_v1',
    id: spec.id,
    pageNumber: spec.pageNumber,
    kind: spec.kind,
    headline: { title: spec.title, conclusion: spec.conclusion },
    visual: {
      type: spec.visualType,
      sourceAssetId: spec.sourceAssetId,
      elements: spec.elements,
      relations: spec.relations,
    },
    zooms: spec.anchors,
    evidenceIds: spec.evidenceIds,
    sourceMarkers: spec.sourceMarkers,
  }
}

export async function generateSlide(input: {
  model: PresentationJsonModel
  companyId: string
  conversationId: string
  presentationId: string
  jobId: string
  page: PagePlanV1
  section: DeckPlanV1['sections'][number]
  previousPage: PagePlanV1 | null
  nextPage: PagePlanV1 | null
  previousPageSummary?: string | null
  usedClaims?: string[]
  evidence: EvidenceItemV1[]
  assets?: PresentationSourceAssetV1[]
  instruction?: string
}): Promise<SlideSpecV1> {
  if (input.page.kind !== 'content') return specialSlide(input.page, input.evidence)
  const allowedEvidence = input.evidence.filter((item) => input.page.evidenceIds.includes(item.id))
  if (allowedEvidence.length === 0) throw new ContentGenerationError(`第 ${input.page.pageNumber} 页没有可授权引用的证据。`)
  const evidencePages = new Set(allowedEvidence.flatMap((item) => item.pageNumber == null ? [] : [item.pageNumber]))
  const evidenceSections = new Set(allowedEvidence.flatMap((item) => item.sectionTitle ? [item.sectionTitle] : []))
  const allowedAssets = (input.assets ?? [])
    .filter((asset) => input.page.sourceIds.includes(asset.sourceId))
    .sort((left, right) => {
      const leftRelevant = (left.pageNumber != null && evidencePages.has(left.pageNumber))
        || (left.sectionTitle != null && evidenceSections.has(left.sectionTitle))
      const rightRelevant = (right.pageNumber != null && evidencePages.has(right.pageNumber))
        || (right.sectionTitle != null && evidenceSections.has(right.sectionTitle))
      return Number(rightRelevant) - Number(leftRelevant)
        || left.sourceId.localeCompare(right.sourceId) || left.assetId.localeCompare(right.assetId)
    }).slice(0, 12)
  const assetMetadata: PresentationSourceAssetMetadataV1[] = allowedAssets.map(({ dataUri: _dataUri, ...metadata }) => metadata)
  let repair = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await input.model.complete({
      purpose: attempt === 0 ? 'presentation.page' : 'presentation.repair',
      companyId: input.companyId,
      conversationId: input.conversationId,
      presentationId: input.presentationId,
      jobId: input.jobId,
      pageId: input.page.id,
      system: pageSystem(),
      user: `章节目标：${input.section.objective}\n本页计划：${JSON.stringify(input.page)}\n` +
        `上一页计划：${input.previousPage ? JSON.stringify(input.previousPage) : '无'}\n` +
        `下一页计划：${input.nextPage ? JSON.stringify(input.nextPage) : '无'}\n` +
        `前页生成摘要：${input.previousPageSummary?.slice(0, 1_000) || '无'}\n` +
        `全局已用论断：${JSON.stringify((input.usedClaims ?? []).slice(-40).map((claim) => claim.slice(0, 500)))}\n` +
        `本页可用源内图片（仅元数据，image 页只能选择其中 assetId）：${JSON.stringify(assetMetadata)}\n` +
        `${input.instruction ? `修订要求：${input.instruction}\n` : ''}${repair}\nEvidence:\n${evidencePrompt(allowedEvidence)}`,
    })
    const parsed = slideSpecSchema.safeParse(raw)
    if (parsed.success) {
      const candidate: SlideSpecV1 = {
        ...parsed.data,
        id: input.page.id,
        pageNumber: input.page.pageNumber,
        kind: input.page.kind,
        visualType: input.page.visualType,
      }
      const elementIds = new Set(candidate.elements.map((element) => element.id))
      const expectedEvidenceIds = new Set(allowedEvidence.map((item) => item.id))
      const candidateEvidenceIds = new Set(candidate.evidenceIds)
      const expectedMarkers = new Set(allowedEvidence.map((item) => item.marker))
      const candidateMarkers = new Set(candidate.sourceMarkers)
      const validAsset = candidate.visualType === 'image'
        ? candidate.sourceAssetId != null
          && allowedAssets.some((asset) => asset.assetId === candidate.sourceAssetId)
          && candidate.elements.length >= 2 && candidate.elements.length <= 4
        : candidate.sourceAssetId == null
      const valid = candidateEvidenceIds.size === expectedEvidenceIds.size
        && [...candidateEvidenceIds].every((id) => expectedEvidenceIds.has(id))
        && candidateMarkers.size === expectedMarkers.size
        && [...candidateMarkers].every((marker) => expectedMarkers.has(marker))
        && validAsset
        && candidate.anchors.length >= 2
        && candidate.anchors.every((anchor) => elementIds.has(anchor.targetElementId))
      if (valid) return candidate
    }
    repair = `上次输出无效或引用越界。只可使用 evidenceIds=${JSON.stringify(input.page.evidenceIds)}，并保证 2–4 个有效锚点。` +
      `visualType=image 时 sourceAssetId 必须来自 ${JSON.stringify(assetMetadata.map((asset) => asset.assetId))}，其他视觉类型必须为 null。`
  }
  throw new ContentGenerationError(`第 ${input.page.pageNumber} 页在两轮定向修复后仍未通过确定性内容门禁。`)
}

export async function runDeckCritic(input: {
  model: PresentationJsonModel
  companyId: string
  conversationId: string
  presentationId: string
  jobId: string
  plan: DeckPlanV1
  specs: SlideSpecV1[]
  evidence: EvidenceItemV1[]
  assets?: PresentationSourceAssetV1[]
}): Promise<QualityIssueV1[]> {
  const deterministic = validateSlideSpecs(input.specs, input.plan, input.evidence, input.assets ?? [])
  if (deterministic.length) return deterministic
  const raw = await input.model.complete({
    purpose: 'presentation.critic',
    companyId: input.companyId,
    conversationId: input.conversationId,
    presentationId: input.presentationId,
    jobId: input.jobId,
    system: `你是整套演示质量审校员。只依据批准大纲与 evidence id，检查重复、跨页矛盾、叙事断裂和无来源断言。
输出 {"issues":[{"pageNumber":整数或null,"code":字符串,"message":字符串}]}；没有问题时 issues=[]。禁止解释。`,
    user: `大纲：${JSON.stringify(input.plan)}\n页面：${JSON.stringify(input.specs.map((spec) => ({
      id: spec.id, pageNumber: spec.pageNumber, title: spec.title, conclusion: spec.conclusion,
      evidenceIds: spec.evidenceIds, labels: spec.elements.map((element) => element.label),
    })))}`,
  })
  const object = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const rows = Array.isArray(object.issues) ? object.issues : []
  return rows.slice(0, 40).flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const row = value as Record<string, unknown>
    const message = typeof row.message === 'string' ? row.message.trim().slice(0, 500) : ''
    const code = typeof row.code === 'string' ? row.code.trim().slice(0, 80) : 'critic.issue'
    const pageNumber = Number(row.pageNumber)
    return message ? [{ schemaVersion: 'quality_issue_v1' as const, severity: 'error' as const, code,
      message, pageNumber: Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= input.specs.length ? pageNumber : null }] : []
  })
}
