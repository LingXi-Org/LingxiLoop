import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import type { Storage } from '../../storage.js'
import {
  deckPlanSchema,
  type EvidenceItemV1,
  type PagePlanV1,
  type QualityIssueV1,
  type SlideSpecV1,
} from './contracts.js'
import {
  type PresentationJsonModel,
  type PresentationMaterialV1,
  buildEvidenceLedger,
  buildSourceAssetCatalog,
  contentIRFromSlideSpec,
  generateDeckPlan,
  generateSlide,
  recommendedPageCount,
  runDeckCritic,
} from './generation.js'
import { ContentGenerationError, PublicationAttentionError } from './errors.js'
import {
  LECTURE_DECK_RENDERER_VERSION,
  LECTURE_DECK_RUNTIME_VERSION,
  PresentationHtmlSizeLimitError,
  compileLectureDeck,
} from './renderer.js'
import { validatePresentationHtml } from './static-validator.js'
import { calculatePresentationQualityMetrics } from './validator.js'
import {
  checkpointPresentationJob,
  claimPresentationJob,
  completePresentationJob,
  failPresentationJob,
  findPresentationForWorker,
  insertPresentationVersion,
  listPresentationEvidence,
  listPresentationPages,
  nextPresentationVersionNumber,
  refreshPresentationSources,
  renewPresentationJobLease,
  replacePresentationEvidence,
  requeuePresentationJob,
  updatePresentationForClaim,
  upsertPresentationPage,
  type AuthorizedPresentationSource,
  type PresentationJobClaim,
  type PresentationRow,
} from './repository.js'

export interface PresentationWorkerInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  storage: Pick<Storage, 'put' | 'deleteObject'>
  model: PresentationJsonModel
  enabled(): boolean
  loadMaterial(source: AuthorizedPresentationSource): Promise<PresentationMaterialV1>
}

function language(claim: PresentationJobClaim): string {
  const value = claim.checkpoint.language
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 32) : 'zh-CN'
}

function pageContext(plan: ReturnType<typeof deckPlanSchema.parse>, pageIndex: number): {
  page: PagePlanV1
  section: ReturnType<typeof deckPlanSchema.parse>['sections'][number]
  previousPage: PagePlanV1 | null
  nextPage: PagePlanV1 | null
} {
  const allPages = plan.sections.flatMap((section) => section.pages)
  const page = allPages[pageIndex]
  if (!page) throw new Error(`approved outline has no page ${pageIndex + 1}`)
  const section = plan.sections.find((candidate) => candidate.pages.some((item) => item.id === page.id))
  if (!section) throw new Error(`approved outline has no section for ${page.id}`)
  return { page, section, previousPage: allPages[pageIndex - 1] ?? null, nextPage: allPages[pageIndex + 1] ?? null }
}

function revisionTargets(claim: PresentationJobClaim, plan: ReturnType<typeof deckPlanSchema.parse>): Set<string> | null {
  if (claim.kind !== 'deckRevision') return null
  const scope = claim.checkpoint.scope
  if (scope === 'page') return new Set(Array.isArray(claim.checkpoint.pageIds) ? claim.checkpoint.pageIds.map(String) : [])
  if (scope === 'section') {
    const ids = new Set(Array.isArray(claim.checkpoint.sectionIds) ? claim.checkpoint.sectionIds.map(String) : [])
    return new Set(plan.sections.filter((section) => ids.has(section.id)).flatMap((section) => section.pages.map((page) => page.id)))
  }
  return null
}

function revisionInstruction(claim: PresentationJobClaim): string | undefined {
  return typeof claim.checkpoint.instruction === 'string' ? claim.checkpoint.instruction.slice(0, 4_000) : undefined
}

export function presentationPageNeedsGeneration(
  previous: SlideSpecV1 | null | undefined,
  targets: ReadonlySet<string> | null,
  pageId: string,
): boolean {
  return previous == null || presentationRevisionAllowsPage(targets, pageId)
}

export function presentationRevisionAllowsPage(
  targets: ReadonlySet<string> | null,
  pageId: string,
): boolean {
  return targets === null || targets.has(pageId)
}

function slideSummary(spec: SlideSpecV1 | undefined): string | null {
  if (!spec) return null
  const labels = spec.elements.map((element) => element.label).slice(0, 8).join('、')
  return `${spec.title}：${spec.conclusion}${labels ? `；视觉节点：${labels}` : ''}`.slice(0, 1_000)
}

function claimsUsedBySpecs(specs: SlideSpecV1[], evidence: EvidenceItemV1[]): string[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item.claim]))
  const claims: string[] = []
  const used = new Set<string>()
  for (const spec of specs) {
    for (const evidenceId of spec.evidenceIds) {
      const claim = evidenceById.get(evidenceId)
      if (claim && !used.has(evidenceId)) {
        used.add(evidenceId)
        claims.push(claim)
      }
    }
  }
  return claims.slice(-40)
}

async function handleSourcesAndOutline(
  infrastructure: PresentationWorkerInfrastructure,
  claim: PresentationJobClaim,
  presentation: PresentationRow,
): Promise<void> {
  const sources = await refreshPresentationSources(infrastructure.db, presentation)
  const snapshot = sources.map(({ externalSourceId: _externalSourceId, ...source }) => source)
  const failed = sources.filter((source) => source.status === 'failed')
  const pending = sources.filter((source) => source.status !== 'ready' || !source.externalSourceId)
  if (failed.length) {
    await infrastructure.transaction(async (db) => {
      await updatePresentationForClaim(db, claim, {
        status: 'needsAttention', sourceSnapshot: snapshot,
        error: `有 ${failed.length} 份资料摄取失败，请处理资料后重试。`,
      })
      await completePresentationJob(db, claim)
    })
    return
  }
  if (pending.length) {
    if (claim.attempts >= 6) {
      await infrastructure.transaction(async (db) => {
        await updatePresentationForClaim(db, claim, {
          status: 'needsAttention', sourceSnapshot: snapshot,
          error: `有 ${pending.length} 份资料尚未完成摄取，请稍后重试。`,
        })
        await completePresentationJob(db, claim)
      })
    } else {
      await infrastructure.transaction(async (db) => {
        await updatePresentationForClaim(db, claim, { status: 'waitingForSources', sourceSnapshot: snapshot })
        await requeuePresentationJob(db, claim, { delaySeconds: 30 })
      })
    }
    return
  }

  await infrastructure.transaction((db) => updatePresentationForClaim(db, claim, { status: 'planning', sourceSnapshot: snapshot }))
  const materials = await Promise.all(sources.map(infrastructure.loadMaterial))
  const assets = buildSourceAssetCatalog(materials)
  const assetMetadata = assets.map(({ dataUri: _dataUri, ...metadata }) => metadata)
  let evidence = await listPresentationEvidence(infrastructure.db, claim.companyId, claim.presentationId)
  if (claim.kind !== 'outlineRevision' || evidence.length === 0) {
    evidence = buildEvidenceLedger(materials, { title: presentation.title, requirements: presentation.request_text })
    if (evidence.length === 0) throw new PublicationAttentionError('Open Notebook 没有返回可支撑演示的有效资料块。')
    const recommended = recommendedPageCount(evidence.length, presentation.target_page_count)
    if (recommended < presentation.target_page_count) {
      await infrastructure.transaction(async (db) => {
        await replacePresentationEvidence(db, claim, evidence)
        await updatePresentationForClaim(db, claim, {
          status: 'needsAttention', recommendedPageCount: recommended,
          error: `现有资料可靠支持约 ${recommended} 页，低于目标 ${presentation.target_page_count} 页。`,
        })
        await completePresentationJob(db, claim)
      })
      return
    }
    await infrastructure.transaction(async (db) => {
      await replacePresentationEvidence(db, claim, evidence)
      await checkpointPresentationJob(db, claim, { stage: 'planning', checkpoint: claim.checkpoint })
    })
  }
  const previousPlan = presentation.outline == null ? undefined : deckPlanSchema.parse(presentation.outline)
  const feedback = typeof claim.checkpoint.feedback === 'string' ? claim.checkpoint.feedback.slice(0, 4_000) : undefined
  const plan = await generateDeckPlan({
    model: infrastructure.model,
    companyId: claim.companyId,
    conversationId: presentation.conversation_id,
    presentationId: presentation.id,
    jobId: claim.id,
    title: presentation.title,
    requirements: presentation.request_text,
    language: language(claim),
    targetPageCount: presentation.target_page_count,
    sources: snapshot,
    evidence,
    assets: assetMetadata,
    ...(previousPlan ? { previousPlan } : {}),
    ...(feedback ? { feedback } : {}),
  })
  await infrastructure.transaction(async (db) => {
    await updatePresentationForClaim(db, claim, {
      status: 'awaitingOutlineApproval', outline: plan, incrementOutlineRevision: true,
      recommendedPageCount: presentation.target_page_count, error: null,
    })
    await checkpointPresentationJob(db, claim, { stage: 'awaitingOutlineApproval', checkpoint: claim.checkpoint })
    await completePresentationJob(db, claim)
  })
}

async function generatePages(
  infrastructure: PresentationWorkerInfrastructure,
  claim: PresentationJobClaim,
  presentation: PresentationRow,
): Promise<void> {
  const plan = deckPlanSchema.parse(presentation.outline)
  const evidence = await listPresentationEvidence(infrastructure.db, claim.companyId, claim.presentationId)
  if (!evidence.length) throw new PublicationAttentionError('已批准演示缺少可审计的 Evidence Ledger。')
  const sources = await refreshPresentationSources(infrastructure.db, presentation)
  const materials = await Promise.all(sources.map(infrastructure.loadMaterial))
  const assets = buildSourceAssetCatalog(materials)
  const stored = new Map((await listPresentationPages(infrastructure.db, claim.companyId, claim.presentationId)).map((page) => [page.id, page]))
  const targets = revisionTargets(claim, plan)
  const specs: SlideSpecV1[] = []
  const usedClaims: string[] = []
  const usedEvidenceIds = new Set<string>()
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const pages = plan.sections.flatMap((section) => section.pages)
  for (let index = 0; index < pages.length; index++) {
    const context = pageContext(plan, index)
    const previous = stored.get(context.page.id)?.slideSpec
    const shouldGenerate = presentationPageNeedsGeneration(previous, targets, context.page.id)
    const spec = shouldGenerate ? await generateSlide({
      model: infrastructure.model,
      companyId: claim.companyId,
      conversationId: presentation.conversation_id,
      presentationId: presentation.id,
      jobId: claim.id,
      ...context,
      previousPageSummary: slideSummary(specs.at(-1)),
      usedClaims,
      evidence,
      assets,
      ...(revisionInstruction(claim) ? { instruction: revisionInstruction(claim) } : {}),
    }) : previous
    if (!spec) throw new Error(`page ${context.page.pageNumber} has no generated specification`)
    specs.push(spec)
    for (const evidenceId of spec.evidenceIds) {
      const item = evidenceById.get(evidenceId)
      if (item && !usedEvidenceIds.has(evidenceId)) {
        usedEvidenceIds.add(evidenceId)
        usedClaims.push(item.claim)
      }
    }
    await infrastructure.transaction(async (db) => {
      if (shouldGenerate) {
        await upsertPresentationPage(db, claim, {
          id: context.page.id, pageNumber: context.page.pageNumber, plan: context.page,
          contentIr: contentIRFromSlideSpec(spec), slideSpec: spec, qualityIssues: [], status: 'validated',
        })
      }
      await checkpointPresentationJob(db, claim, {
        stage: 'generating', checkpoint: { ...claim.checkpoint, completedPage: context.page.pageNumber },
      })
    })
  }

  await infrastructure.transaction((db) => updatePresentationForClaim(db, claim, { status: 'validating' }))
  let issues = await runDeckCritic({
    model: infrastructure.model, companyId: claim.companyId,
    conversationId: presentation.conversation_id, presentationId: presentation.id,
    jobId: claim.id, plan, specs, evidence, assets,
  })
  for (let repair = 0; issues.length && repair < 2; repair++) {
    const pagesToRepair = new Set(issues.flatMap((item) => {
      if (item.pageNumber == null) return []
      const plannedPage = pages[item.pageNumber - 1]
      if (!plannedPage || !presentationRevisionAllowsPage(targets, plannedPage.id)) return []
      return [item.pageNumber]
    }))
    if (!pagesToRepair.size) break
    for (const pageNumber of pagesToRepair) {
      const index = pageNumber - 1
      const context = pageContext(plan, index)
      if (context.page.kind !== 'content') continue
      const pageIssues = issues.filter((item) => item.pageNumber === pageNumber).map((item) => item.message).join('；')
      specs[index] = await generateSlide({
        model: infrastructure.model, companyId: claim.companyId,
        conversationId: presentation.conversation_id, presentationId: presentation.id, jobId: claim.id,
        ...context,
        previousPageSummary: slideSummary(specs[index - 1]),
        usedClaims: claimsUsedBySpecs(specs.filter((_, specIndex) => specIndex !== index), evidence),
        evidence,
        assets,
        instruction: `${revisionInstruction(claim) ?? ''}\n质量修复：${pageIssues}`.trim(),
      })
      await infrastructure.transaction((db) => upsertPresentationPage(db, claim, {
        id: context.page.id, pageNumber, plan: context.page,
        contentIr: contentIRFromSlideSpec(specs[index]!), slideSpec: specs[index]!,
        qualityIssues: [], status: 'validated',
      }))
    }
    issues = await runDeckCritic({
      model: infrastructure.model, companyId: claim.companyId,
      conversationId: presentation.conversation_id, presentationId: presentation.id,
      jobId: claim.id, plan, specs, evidence, assets,
    })
  }
  if (issues.length) {
    const byPage = new Map<number, QualityIssueV1[]>()
    for (const item of issues) if (item.pageNumber != null) byPage.set(item.pageNumber, [...(byPage.get(item.pageNumber) ?? []), item])
    await infrastructure.transaction(async (db) => {
      for (const [pageNumber, pageIssues] of byPage) {
        const context = pageContext(plan, pageNumber - 1)
        if (!presentationRevisionAllowsPage(targets, context.page.id)) continue
        await upsertPresentationPage(db, claim, {
          id: context.page.id, pageNumber, plan: context.page,
          contentIr: contentIRFromSlideSpec(specs[pageNumber - 1]!), slideSpec: specs[pageNumber - 1]!,
          qualityIssues: pageIssues, status: 'failed',
        })
      }
      await updatePresentationForClaim(db, claim, {
        status: 'needsAttention', error: `质量门禁仍有 ${issues.length} 项错误，未发布 HTML。`,
      })
      await completePresentationJob(db, claim)
    })
    return
  }

  let compiled: ReturnType<typeof compileLectureDeck>
  try {
    compiled = compileLectureDeck({ title: presentation.title, specs, evidence, assets })
  } catch (error) {
    if (!(error instanceof PresentationHtmlSizeLimitError)) throw error
    await infrastructure.transaction(async (db) => {
      await updatePresentationForClaim(db, claim, {
        status: 'needsAttention',
        error: `自包含 HTML 为 ${(error.sizeBytes / 1024 / 1024).toFixed(2)} MiB，超过 25 MiB 发布上限，未发布文件。`,
      })
      await completePresentationJob(db, claim)
    })
    return
  }
  const deterministicValidation = validatePresentationHtml(compiled.html)
  if (!deterministicValidation.passed) {
    await infrastructure.transaction(async (db) => {
      await updatePresentationForClaim(db, claim, {
        status: 'needsAttention',
        error: `HTML 静态发布门禁未通过（${deterministicValidation.issues.length} 项），未发布文件。`,
      })
      await checkpointPresentationJob(db, claim, {
        stage: 'needsAttention',
        checkpoint: { ...claim.checkpoint, deterministicValidation },
      })
      await completePresentationJob(db, claim)
    })
    return
  }
  const qualityMetrics = calculatePresentationQualityMetrics(specs, plan, evidence)
  const { schemaVersion: metricsSchemaVersion, ...qualityReportMetrics } = qualityMetrics
  const versionNumber = await nextPresentationVersionNumber(infrastructure.db, claim.companyId, claim.presentationId)
  const versionId = `presentation-version-${randomUUID()}`
  const storageKey = `presentation-artifacts/${claim.companyId}/${claim.presentationId}/${versionNumber}/deck.html`
  await infrastructure.storage.put(storageKey, Buffer.from(compiled.html), 'text/html; charset=utf-8')
  try {
    await infrastructure.transaction(async (db) => {
      await insertPresentationVersion(db, claim, {
        id: versionId, versionNumber, storageKey, sha256: compiled.sha256, sizeBytes: compiled.sizeBytes,
        manifest: compiled.manifest,
        qualityReport: {
          schemaVersion: 'presentation_quality_report_v1', errors: 0, warnings: 0,
          metricsSchemaVersion,
          ...qualityReportMetrics,
          deterministicValidation,
          validationMode: 'deterministic-static',
        },
        runtimeVersion: LECTURE_DECK_RUNTIME_VERSION,
        rendererVersion: LECTURE_DECK_RENDERER_VERSION,
      })
      await checkpointPresentationJob(db, claim, { stage: 'ready', checkpoint: { ...claim.checkpoint, versionId } })
      await completePresentationJob(db, claim)
    })
  } catch (error) {
    await infrastructure.storage.deleteObject(storageKey).catch(() => undefined)
    throw error
  }
}

async function processClaim(infrastructure: PresentationWorkerInfrastructure, claim: PresentationJobClaim): Promise<void> {
  const presentation = await findPresentationForWorker(infrastructure.db, claim.companyId, claim.presentationId)
  if (!presentation) throw new Error('presentation job lost its owning presentation')
  if (claim.kind === 'outlineRevision' || !presentation.outline || presentation.status === 'waitingForSources' || presentation.status === 'planning') {
    await handleSourcesAndOutline(infrastructure, claim, presentation)
    return
  }
  await generatePages(infrastructure, claim, presentation)
}

export function isTransientPresentationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; message?: unknown; cause?: unknown }
  const status = Number(value.status ?? value.statusCode)
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return true
  const code = String(value.code ?? '').toUpperCase()
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EPIPE'].includes(code)) return true
  const name = String(value.name ?? '')
  const message = String(value.message ?? '')
  if (/AbortError|TimeoutError/i.test(name) || /\b(?:timeout|timed out|rate limit|temporar(?:y|ily)|network)\b|\b429\b|\b5\d\d\b/i.test(message)) return true
  return value.cause != null && value.cause !== error && isTransientPresentationError(value.cause)
}

export function createPresentationWorker(infrastructure: PresentationWorkerInfrastructure) {
  async function runOnce(workerId = `presentation-${process.pid}`): Promise<boolean> {
    if (!infrastructure.enabled()) return false
    const claim = await infrastructure.transaction((db) => claimPresentationJob(db, new Date(), `${workerId}:${randomUUID()}`))
    if (!claim) return false
    const heartbeat = setInterval(() => {
      void renewPresentationJobLease(infrastructure.db, claim).catch(() => undefined)
    }, 60_000)
    heartbeat.unref?.()
    try {
      await processClaim(infrastructure, claim)
    } catch (error) {
      const attention = error instanceof ContentGenerationError || error instanceof PublicationAttentionError
      await infrastructure.transaction(async (db) => {
        if (attention) {
          await updatePresentationForClaim(db, claim, { status: 'needsAttention', error: error.message })
          await checkpointPresentationJob(db, claim, {
            stage: 'needsAttention',
            checkpoint: { ...claim.checkpoint, attentionCode: error.name, attentionFromStage: claim.stage },
          })
          await completePresentationJob(db, claim)
          return
        }
        const transient = isTransientPresentationError(error)
        const final = !transient || claim.attempts >= 6
        const message = transient
          ? '演示依赖服务暂时不可用，自动重试已耗尽。'
          : '演示 Worker 遇到不可恢复的内部错误。'
        if (final) await updatePresentationForClaim(db, claim, { status: 'failed', error: message })
        await failPresentationJob(db, claim, {
          error: transient && !final ? 'presentation dependency temporarily unavailable' : message,
          final,
        })
      }).catch((fenceError) => {
        console.warn('[presentations] failed to record a fenced job failure', fenceError)
      })
    } finally {
      clearInterval(heartbeat)
    }
    return true
  }

  function start(intervalMs = Number(process.env.PRESENTATION_WORKER_INTERVAL_MS ?? 2_000)): WorkerTaskHandle | null {
    if (!infrastructure.enabled() || !Number.isFinite(intervalMs) || intervalMs <= 0) return null
    let stopped = false, running = false
    const tick = async () => {
      if (stopped || running) return
      running = true
      try {
        for (let index = 0; index < 2 && await runOnce(); index++); // bounded drain
      } catch (error) {
        console.warn('[presentations] worker tick failed', error)
      } finally { running = false }
    }
    const immediate = setImmediate(() => void tick())
    const timer = setInterval(() => void tick(), Math.max(1_000, intervalMs))
    timer.unref?.()
    return { stop: () => { stopped = true; clearImmediate(immediate); clearInterval(timer) } }
  }
  return { runOnce, start }
}
