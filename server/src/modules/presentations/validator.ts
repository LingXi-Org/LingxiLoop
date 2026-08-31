import {
  type DeckPlanV1,
  type EvidenceItemV1,
  type QualityIssueV1,
  type SlideSpecV1,
  type SourceCoverageV1,
  deckPlanSchema,
  slideSpecSchema,
} from './contracts.js'

function issue(code: string, message: string, pageNumber: number | null = null): QualityIssueV1 {
  return { schemaVersion: 'quality_issue_v1', severity: 'error', code, message, pageNumber }
}

/** Approximate the lecture-deck visible-text budget. CJK code points count one;
 * contiguous ASCII words count one apiece. Panel prose is deliberately excluded. */
export function visibleTextUnits(value: string): number {
  const cjk = value.match(/[\u2e80-\u9fff\uf900-\ufaff]/gu)?.length ?? 0
  const withoutCjk = value.replace(/[\u2e80-\u9fff\uf900-\ufaff]/gu, ' ')
  return cjk + (withoutCjk.match(/[\p{L}\p{N}]+/gu)?.length ?? 0)
}

function normalizedEvidenceText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s,，]/gu, '')
}

export function numericAndDateTokens(value: string): string[] {
  const normalized = value.normalize('NFKC')
  const matches = normalized.match(/[+-]?(?:\d{4}(?:[-/.]\d{1,2}){1,2}|\d{4}年\d{1,2}月(?:\d{1,2}日)?|\d{1,3}(?:[,，\s]\d{3})+(?:\.\d+)?%?|\d+(?:\.\d+)?%?)/gu) ?? []
  return unique(matches.map((token) => normalizedEvidenceText(token)))
}

function specFactText(spec: SlideSpecV1): string[] {
  return [
    spec.title,
    spec.conclusion,
    ...spec.elements.flatMap((element) => [element.label, element.detail]),
    ...spec.anchors.flatMap((anchor) => [
      anchor.label,
      anchor.panel.observation,
      anchor.panel.reason,
      anchor.panel.meaning,
    ]),
  ]
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index])
}

function selectedSourceIdsFromPlan(plan: DeckPlanV1): string[] {
  return unique([
    ...plan.sourceCoverage.coveredSourceIds,
    ...plan.sourceCoverage.uncoveredSourceIds,
  ])
}

/** Recompute source coverage from page-level source bindings. The plan's
 * self-reported counters are deliberately ignored. */
export function calculateSourceCoverage(
  plan: DeckPlanV1,
  selectedSourceIds: readonly string[] = selectedSourceIdsFromPlan(plan),
): SourceCoverageV1 {
  const selected = unique(selectedSourceIds)
  const referenced = new Set(plan.sections.flatMap((section) => section.pages)
    .filter((page) => page.kind === 'content')
    .flatMap((page) => page.sourceIds))
  const coveredSourceIds = selected.filter((sourceId) => referenced.has(sourceId))
  const uncoveredSourceIds = selected.filter((sourceId) => !referenced.has(sourceId))
  return {
    selectedSourceCount: selected.length,
    readySourceCount: selected.length,
    coveredSourceIds,
    uncoveredSourceIds,
    coverageRatio: selected.length === 0 ? 0 : coveredSourceIds.length / selected.length,
  }
}

export function validateDeckPlan(
  plan: DeckPlanV1,
  selectedSourceIds: readonly string[] = selectedSourceIdsFromPlan(plan),
): QualityIssueV1[] {
  const parsed = deckPlanSchema.safeParse(plan)
  if (!parsed.success) return parsed.error.issues.map((item) => issue('outline.schema', item.message))
  const pages = plan.sections.flatMap((section) => section.pages)
  const issues: QualityIssueV1[] = []
  const selected = unique(selectedSourceIds)
  const selectedSet = new Set(selected)
  const actualCoverage = calculateSourceCoverage(plan, selected)
  if (plan.sourceCoverage.selectedSourceCount !== actualCoverage.selectedSourceCount
    || plan.sourceCoverage.readySourceCount !== actualCoverage.readySourceCount
    || !sameMembers(plan.sourceCoverage.coveredSourceIds, actualCoverage.coveredSourceIds)
    || !sameMembers(plan.sourceCoverage.uncoveredSourceIds, actualCoverage.uncoveredSourceIds)
    || Math.abs(plan.sourceCoverage.coverageRatio - actualCoverage.coverageRatio) > Number.EPSILON) {
    issues.push(issue('outline.sourceCoverageMismatch', 'Source coverage must be derived from page-level source bindings'))
  }
  if (actualCoverage.coverageRatio < 0.9) {
    issues.push(issue('outline.sourceCoverage', 'At least 90% of selected sources must be covered by the outline'))
  }
  if (pages[0]?.kind !== 'opening') issues.push(issue('outline.opening', 'The first page must be opening', 1))
  if (pages.at(-1)?.kind !== 'closing') issues.push(issue('outline.closing', 'The last page must be closing', pages.length))
  if (pages.at(-2)?.kind !== 'sources') issues.push(issue('outline.sources', 'The sources page must immediately precede closing', Math.max(1, pages.length - 1)))
  const ids = new Set<string>()
  for (const page of pages) {
    if (ids.has(page.id)) issues.push(issue('outline.duplicateId', `Duplicate page id: ${page.id}`, page.pageNumber))
    ids.add(page.id)
    if (page.kind === 'content' && page.zoomPointCount < 2) {
      issues.push(issue('outline.zoomCount', 'Content pages require at least two zoom points', page.pageNumber))
    }
    if (page.kind === 'content' && page.evidenceIds.length === 0) {
      issues.push(issue('outline.evidence', 'Content pages require evidence', page.pageNumber))
    }
    for (const sourceId of page.sourceIds) {
      if (!selectedSet.has(sourceId)) {
        issues.push(issue('outline.unselectedSource', `Page references an unselected source: ${sourceId}`, page.pageNumber))
      }
    }
  }
  return issues
}

export interface PresentationQualityMetricsV1 {
  schemaVersion: 'presentation_quality_metrics_v1'
  sourceCoverageRatio: number
  evidenceCoverageRatio: number
  citationMarkerCoverageRatio: number
  duplicatePageRatio: number
  visualPageRatio: number
  zoomPageRatio: number
  numericDateTokenCoverageRatio: number
  contentPageCount: number
  generatedPageCount: number
}

function normalizedPageFingerprint(spec: SlideSpecV1): string {
  return [
    spec.visualType,
    spec.conclusion,
    ...spec.elements.map((element) => `${element.label}:${element.detail}:${String(element.value ?? '')}`),
  ].join('|').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

export function calculatePresentationQualityMetrics(
  specs: SlideSpecV1[],
  plan: DeckPlanV1,
  evidence: EvidenceItemV1[],
): PresentationQualityMetricsV1 {
  const plannedPages = plan.sections.flatMap((section) => section.pages)
  const specsById = new Map(specs.map((spec) => [spec.id, spec]))
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const contentPlans = plannedPages.filter((page) => page.kind === 'content')
  const contentSpecs = contentPlans.flatMap((page) => {
    const spec = specsById.get(page.id)
    return spec?.kind === 'content' ? [spec] : []
  })
  let plannedEvidenceAssignments = 0
  let usedEvidenceAssignments = 0
  let expectedMarkerAssignments = 0
  let matchedMarkerAssignments = 0
  let numericDateTokenCount = 0
  let supportedNumericDateTokenCount = 0
  for (const page of contentPlans) {
    const spec = specsById.get(page.id)
    const plannedEvidence = unique(page.evidenceIds)
    const usedEvidence = new Set(spec?.evidenceIds ?? [])
    plannedEvidenceAssignments += plannedEvidence.length
    usedEvidenceAssignments += plannedEvidence.filter((id) => usedEvidence.has(id)).length
    const expectedMarkers = unique((spec?.evidenceIds ?? []).flatMap((id) => {
      const item = evidenceById.get(id)
      return item ? [item.marker] : []
    }))
    const actualMarkers = new Set(spec?.sourceMarkers ?? [])
    expectedMarkerAssignments += expectedMarkers.length
    matchedMarkerAssignments += expectedMarkers.filter((marker) => actualMarkers.has(marker)).length
    if (spec) {
      const evidenceText = normalizedEvidenceText(spec.evidenceIds.flatMap((id) => {
        const item = evidenceById.get(id)
        return item ? [item.claim, item.excerpt] : []
      }).join(' '))
      const tokens = unique([
        ...specFactText(spec).flatMap(numericAndDateTokens),
        ...spec.elements.flatMap((element) => element.value == null ? [] : numericAndDateTokens(String(element.value))),
      ])
      numericDateTokenCount += tokens.length
      supportedNumericDateTokenCount += tokens.filter((token) => evidenceText.includes(token)).length
    }
  }
  const fingerprints = new Set<string>()
  let duplicatePages = 0
  for (const spec of contentSpecs) {
    const fingerprint = normalizedPageFingerprint(spec)
    if (fingerprints.has(fingerprint)) duplicatePages++
    else fingerprints.add(fingerprint)
  }
  const contentPageCount = contentPlans.length
  const ratio = (numerator: number, denominator: number, emptyValue = 0) => denominator === 0 ? emptyValue : numerator / denominator
  return {
    schemaVersion: 'presentation_quality_metrics_v1',
    sourceCoverageRatio: calculateSourceCoverage(plan).coverageRatio,
    evidenceCoverageRatio: ratio(usedEvidenceAssignments, plannedEvidenceAssignments),
    citationMarkerCoverageRatio: ratio(matchedMarkerAssignments, expectedMarkerAssignments),
    duplicatePageRatio: ratio(duplicatePages, contentSpecs.length, 0),
    visualPageRatio: ratio(contentSpecs.filter((spec) => spec.elements.length >= 2).length, contentPageCount),
    zoomPageRatio: ratio(contentSpecs.filter((spec) => spec.anchors.length >= 2 && spec.anchors.length <= 4).length, contentPageCount),
    numericDateTokenCoverageRatio: ratio(supportedNumericDateTokenCount, numericDateTokenCount, 1),
    contentPageCount,
    generatedPageCount: specs.length,
  }
}

export function validateSlideSpecs(
  specs: SlideSpecV1[],
  plan: DeckPlanV1,
  evidence: EvidenceItemV1[],
  sourceAssets: ReadonlyArray<{ assetId: string; sourceId: string }> = [],
): QualityIssueV1[] {
  const issues = validateDeckPlan(plan)
  const plannedPages = plan.sections.flatMap((section) => section.pages)
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const evidenceIds = new Set(evidenceById.keys())
  const evidenceMarkers = new Set(evidence.map((item) => item.marker))
  const assetsById = new Map(sourceAssets.map((asset) => [asset.assetId, asset]))
  if (specs.length !== plannedPages.length) {
    issues.push(issue('deck.pageCount', 'Every planned page must have exactly one rendered specification'))
  }
  for (const [index, raw] of specs.entries()) {
    const parsed = slideSpecSchema.safeParse(raw)
    if (!parsed.success) {
      issues.push(issue('slide.schema', parsed.error.issues[0]?.message ?? 'Invalid slide schema', index + 1))
      continue
    }
    const spec = parsed.data
    const planned = plannedPages[index]
    if (!planned || spec.id !== planned.id || spec.pageNumber !== index + 1 || spec.kind !== planned.kind) {
      issues.push(issue('slide.planMismatch', 'Slide identity does not match the approved outline', index + 1))
    }
    const elementIds = new Set(spec.elements.map((element) => element.id))
    for (const relation of spec.relations) {
      if (!elementIds.has(relation.from) || !elementIds.has(relation.to)) {
        issues.push(issue('slide.relationTarget', 'A visual relation references an unknown element', spec.pageNumber))
      }
    }
    for (const anchor of spec.anchors) {
      if (!elementIds.has(anchor.targetElementId)) {
        issues.push(issue('slide.anchorTarget', 'A zoom anchor references an unknown element', spec.pageNumber))
      }
    }
    if (spec.kind === 'content') {
      if (spec.elements.length < 2) issues.push(issue('slide.visual', 'Content pages require a meaningful visual', spec.pageNumber))
      if (spec.anchors.length < 2 || spec.anchors.length > 4) issues.push(issue('slide.anchors', 'Content pages require 2–4 zoom anchors', spec.pageNumber))
      if (spec.evidenceIds.length === 0) issues.push(issue('slide.evidence', 'Content pages require source evidence', spec.pageNumber))
      if (visibleTextUnits([spec.title, spec.conclusion, ...spec.elements.map((item) => item.label)].join(' ')) > 110) {
        issues.push(issue('slide.textBudget', 'Visible slide text exceeds the strict 110-unit budget', spec.pageNumber))
      }
      if (spec.visualType === 'image') {
        const asset = spec.sourceAssetId == null ? null : assetsById.get(spec.sourceAssetId)
        if (!asset || !planned?.sourceIds.includes(asset.sourceId)) {
          issues.push(issue('slide.sourceAsset', 'Image slides must bind an approved source-owned asset', spec.pageNumber))
        }
      } else if (spec.sourceAssetId != null) {
        issues.push(issue('slide.unexpectedAsset', 'Only image slides may bind a source asset', spec.pageNumber))
      }
      if (planned) {
        const plannedEvidenceIds = new Set(planned.evidenceIds)
        for (const id of spec.evidenceIds) {
          if (!plannedEvidenceIds.has(id)) {
            issues.push(issue('slide.unplannedEvidence', `Evidence is outside the approved page plan: ${id}`, spec.pageNumber))
          }
        }
        for (const id of planned.evidenceIds) {
          const item = evidenceById.get(id)
          if (item && !planned.sourceIds.includes(item.sourceId)) {
            issues.push(issue('slide.evidenceSourceMismatch', `Planned evidence is not bound to its source: ${id}`, spec.pageNumber))
          }
        }
      }
      const markersForEvidence = new Set(spec.evidenceIds.flatMap((id) => {
        const item = evidenceById.get(id)
        return item ? [item.marker] : []
      }))
      for (const marker of spec.sourceMarkers) {
        if (!markersForEvidence.has(marker)) {
          issues.push(issue('slide.markerWithoutEvidence', `Source marker has no corresponding page evidence: ${marker}`, spec.pageNumber))
        }
      }
      for (const marker of markersForEvidence) {
        if (!spec.sourceMarkers.includes(marker)) {
          issues.push(issue('slide.missingMarker', `Referenced evidence is missing its source marker: ${marker}`, spec.pageNumber))
        }
      }
      const citedEvidenceText = normalizedEvidenceText(spec.evidenceIds.flatMap((id) => {
        const item = evidenceById.get(id)
        return item ? [item.claim, item.excerpt] : []
      }).join(' '))
      for (const token of specFactText(spec).flatMap(numericAndDateTokens)) {
        if (!citedEvidenceText.includes(token)) {
          issues.push(issue('slide.numericDateEvidence', `Numeric/date token is absent from cited evidence: ${token}`, spec.pageNumber))
        }
      }
      for (const element of spec.elements) {
        if (element.value == null) continue
        for (const token of numericAndDateTokens(String(element.value))) {
          if (!citedEvidenceText.includes(token)) {
            issues.push(issue(
              spec.visualType === 'chart' ? 'slide.chartValueEvidence' : 'slide.numericDateEvidence',
              `Visual value is absent from cited evidence: ${token}`,
              spec.pageNumber,
            ))
          }
        }
      }
    }
    for (const id of spec.evidenceIds) {
      if (!evidenceIds.has(id)) issues.push(issue('slide.unknownEvidence', `Unknown evidence id: ${id}`, spec.pageNumber))
    }
    for (const marker of spec.sourceMarkers) {
      if (!evidenceMarkers.has(marker)) issues.push(issue('slide.unknownMarker', `Unknown source marker: ${marker}`, spec.pageNumber))
    }
  }
  const metrics = calculatePresentationQualityMetrics(specs, plan, evidence)
  if (metrics.evidenceCoverageRatio < 0.95) {
    issues.push(issue('deck.evidenceCoverage', 'At least 95% of page-planned evidence assignments must be cited'))
  }
  if (metrics.citationMarkerCoverageRatio < 1) {
    issues.push(issue('deck.citationMarkers', 'Every cited evidence source must have a matching visible marker'))
  }
  if (metrics.duplicatePageRatio > 0.05) {
    issues.push(issue('deck.duplicatePages', 'Duplicate content page rate exceeds 5%'))
  }
  return issues
}
