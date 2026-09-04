import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { AgentWorkItem } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import { PresentationsApplication, PresentationApplicationError } from '../modules/presentations/application.js'
import type {
  ContentIRV1,
  DeckPlanV1,
  EvidenceItemV1,
  PagePlanV1,
  SlideSpecV1,
} from '../modules/presentations/contracts.js'
import {
  contentIRSchema,
  deckPlanSchema,
  revisePresentationOutlineRequestSchema,
  slideSpecSchema,
} from '../modules/presentations/contracts.js'
import {
  buildEvidenceLedger,
  buildSourceAssetCatalog,
  contentIRFromSlideSpec,
  type PresentationMaterialV1,
} from '../modules/presentations/generation.js'
import { ContentGenerationError, PublicationAttentionError } from '../modules/presentations/errors.js'
import { compileLectureDeck } from '../modules/presentations/renderer.js'
import {
  claimPresentationJob,
  findAccessiblePresentation,
  findPrivatePresentationDeliveryChannel,
  requestPresentationOutlineRevision,
  resolvePresentationCreationScope,
  upsertPresentationPage,
  updatePresentationForClaim,
} from '../modules/presentations/repository.js'
import { createPresentationStorageGc } from '../modules/presentations/storage-gc.js'
import {
  isTransientPresentationError,
  presentationPageNeedsGeneration,
  presentationRevisionAllowsPage,
} from '../modules/presentations/worker.js'
import {
  calculatePresentationQualityMetrics,
  validateDeckPlan,
  validateSlideSpecs,
  visibleTextUnits,
} from '../modules/presentations/validator.js'

const evidence: EvidenceItemV1 = {
  schemaVersion: 'evidence_item_v1', id: 'evidence-1', sourceId: 'source-1', sourceTitle: '系统设计资料',
  chunkId: 'chunk-1', pageNumber: 3, sectionTitle: '架构', excerpt: '系统由输入、处理和输出三个阶段组成。',
  claim: '系统由三个阶段组成。', marker: 'S1', position: 0,
}

function page(id: string, pageNumber: number, kind: PagePlanV1['kind']): PagePlanV1 {
  const titles = ['开场', '信息流', '反馈闭环', '资料索引', '结语']
  return {
    id, pageNumber, kind, title: titles[pageNumber - 1] ?? '演示页面',
    conclusion: kind === 'content' ? (pageNumber === 2 ? '结构决定了信息如何可靠流动' : '反馈闭环决定系统如何持续校正') : '',
    visualType: kind === 'content' ? 'process' : 'diagram',
    evidenceIds: kind === 'content' ? [evidence.id] : [], sourceIds: kind === 'content' ? [evidence.sourceId] : [],
    zoomPointCount: kind === 'content' ? 2 : 0,
  }
}

const pages = [page('opening', 1, 'opening'), page('content-1', 2, 'content'), page('content-2', 3, 'content'), page('sources', 4, 'sources'), page('closing', 5, 'closing')]
const plan: DeckPlanV1 = {
  schemaVersion: 'deck_plan_v1', title: '系统设计', subtitle: '', audience: '学习者', objective: '理解系统结构', language: 'zh-CN',
  targetPageCount: 5,
  sourceCoverage: { selectedSourceCount: 1, readySourceCount: 1, coveredSourceIds: ['source-1'], uncoveredSourceIds: [], coverageRatio: 1 },
  sections: [{ id: 'section-1', title: '完整讲解', objective: '理解结构', summary: '从开场到总结', pages }],
}

function spec(pagePlan: PagePlanV1): SlideSpecV1 {
  const content = pagePlan.kind === 'content'
  return {
    schemaVersion: 'slide_spec_v1', id: pagePlan.id, pageNumber: pagePlan.pageNumber, kind: pagePlan.kind,
    title: pagePlan.title, conclusion: pagePlan.conclusion, visualType: pagePlan.visualType,
    sourceAssetId: null,
    elements: content ? [
      { id: `${pagePlan.id}-a`, label: '输入', detail: '受控资料', value: null, group: null },
      { id: `${pagePlan.id}-b`, label: '输出', detail: '可靠结论', value: null, group: null },
    ] : [],
    relations: content ? [{ from: `${pagePlan.id}-a`, to: `${pagePlan.id}-b`, label: '处理' }] : [],
    anchors: content ? [
      { id: `${pagePlan.id}-zoom-a`, label: '观察输入', targetElementId: `${pagePlan.id}-a`, panel: { observation: '输入来自受控资料', reason: '来源已被冻结', meaning: '事实可以复核' } },
      { id: `${pagePlan.id}-zoom-b`, label: '观察输出', targetElementId: `${pagePlan.id}-b`, panel: { observation: '输出形成可靠结论', reason: '流程经过校验', meaning: '内容可以交付' } },
    ] : [],
    evidenceIds: content ? [evidence.id] : [], sourceMarkers: content || pagePlan.kind === 'sources' ? ['S1'] : [],
  }
}

const specs = pages.map(spec)

test('Artifact data is minimal and tracked LLM metadata includes the job fence identity', () => {
  const source = readFileSync(new URL('../modules/presentations/facade.ts', import.meta.url), 'utf8')
  const extras = /extras:\s*\{([\s\S]*?)\n\s*\},\n\s*\},\s*\{/.exec(source)?.[1] ?? ''
  assert.match(extras, /presentationId:\s*input\.presentationId/)
  assert.match(extras, /jobId:\s*input\.jobId/)
  assert.doesNotMatch(extras, /input\.(?:system|user)/)
  const artifactData = /data:\s*\{\s*artifactId:\s*input\.presentationId,\s*artifactKind:\s*'lecture_deck_html',\s*title:\s*input\.title,?\s*\}/.exec(source)?.[0] ?? ''
  assert.ok(artifactData)
  assert.doesNotMatch(artifactData, /status|source|storage|outline/)
})

test('evidence selection is relevance-first, source-covering and keeps image bytes out of model metadata', () => {
  const materials: PresentationMaterialV1[] = [
    {
      schemaVersion: 'presentation_material_v1', sourceId: 'source-1', title: '模型资料', truncated: false,
      blocks: [
        { chunkId: 'unrelated', ordinal: 0, text: '这一段讨论完全不同的行政流程与日常安排，不涉及研究主题。', pageNumber: 1, sectionTitle: '附录' },
        { chunkId: 'relevant', ordinal: 1, text: '量子模型通过受控证据验证关键结论，并保留完整来源位置。', pageNumber: 3, sectionTitle: '量子模型' },
      ],
      assets: [
        { assetId: 'upstream-raster-id', mimeType: 'image/png', dataUri: 'data:image/png;base64,iVBORw0KGgo=', pageNumber: 3, sectionTitle: '量子模型', width: 640, height: 360 },
        { assetId: 'unsafe-svg-id', mimeType: 'image/svg+xml', dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', pageNumber: 4, sectionTitle: '附录', width: 10, height: 10 },
      ],
    },
    {
      schemaVersion: 'presentation_material_v1', sourceId: 'source-2', title: '验证资料', truncated: false,
      blocks: [{ chunkId: 'coverage', ordinal: 0, text: '第二份资料给出验证阶段的独立说明，确保每个来源均被覆盖。', pageNumber: 2, sectionTitle: '验证' }],
      assets: [],
    },
  ]
  const ledger = buildEvidenceLedger(materials, { title: '量子模型', requirements: '说明量子模型的证据验证' })
  assert.equal(ledger[0]?.chunkId, 'relevant')
  assert.deepEqual(new Set(ledger.map((item) => item.sourceId)), new Set(['source-1', 'source-2']))
  const assets = buildSourceAssetCatalog(materials)
  assert.equal(assets.length, 1)
  assert.notEqual(assets[0]?.assetId, 'upstream-raster-id')
  const { dataUri: _dataUri, ...metadata } = assets[0]!
  assert.doesNotMatch(JSON.stringify(metadata), /base64|upstream-raster-id/)
})

test('versioned presentation contracts reject unknown and structurally incomplete model output', () => {
  assert.equal(deckPlanSchema.safeParse(plan).success, true)
  assert.equal(deckPlanSchema.safeParse({ ...plan, schemaVersion: 'deck_plan_v2' }).success, false)
  assert.equal(slideSpecSchema.safeParse(specs[1]).success, true)
  assert.equal(slideSpecSchema.safeParse({ ...specs[1], script: 'alert(1)' }).success, false)
  const contentIr: ContentIRV1 = contentIRFromSlideSpec(specs[1]!)
  assert.equal(contentIRSchema.safeParse(contentIr).success, true)
  assert.equal(contentIRSchema.safeParse({ ...contentIr, schemaVersion: 'content_ir_v2' }).success, false)
  assert.equal(revisePresentationOutlineRequestSchema.safeParse({
    expectedRevision: 0, idempotencyKey: 'accept-shorter', targetSlideCount: 12,
  }).success, true)
  assert.equal(revisePresentationOutlineRequestSchema.safeParse({
    expectedRevision: 0, idempotencyKey: 'empty-revision',
  }).success, false)
})

test('deterministic validation enforces evidence, anchor targets and the strict visible-text budget', () => {
  assert.deepEqual(validateSlideSpecs(specs, plan, [evidence]), [])
  const broken = structuredClone(specs)
  broken[1]!.anchors[0]!.targetElementId = 'unknown-element'
  assert.ok(validateSlideSpecs(broken, plan, [evidence]).some((item) => item.code === 'slide.anchorTarget'))
  const outsidePlan = structuredClone(specs)
  outsidePlan[1]!.evidenceIds = ['evidence-2']
  outsidePlan[1]!.sourceMarkers = ['S2']
  const secondEvidence = { ...evidence, id: 'evidence-2', chunkId: 'chunk-2', marker: 'S2' }
  assert.ok(validateSlideSpecs(outsidePlan, plan, [evidence, secondEvidence])
    .some((item) => item.code === 'slide.unplannedEvidence'))
  const duplicate = structuredClone(specs)
  duplicate[2]!.conclusion = duplicate[1]!.conclusion
  assert.ok(validateSlideSpecs(duplicate, plan, [evidence])
    .some((item) => item.code === 'deck.duplicatePages'))
  assert.deepEqual(calculatePresentationQualityMetrics(specs, plan, [evidence]), {
    schemaVersion: 'presentation_quality_metrics_v1',
    sourceCoverageRatio: 1,
    evidenceCoverageRatio: 1,
    citationMarkerCoverageRatio: 1,
    duplicatePageRatio: 0,
    visualPageRatio: 1,
    zoomPageRatio: 1,
    numericDateTokenCoverageRatio: 1,
    contentPageCount: 2,
    generatedPageCount: 5,
  })
  const lowCoveragePlan = structuredClone(plan)
  lowCoveragePlan.sourceCoverage = {
    selectedSourceCount: 2, readySourceCount: 2,
    coveredSourceIds: ['source-1'], uncoveredSourceIds: ['source-2'], coverageRatio: 0.5,
  }
  assert.ok(validateDeckPlan(lowCoveragePlan, ['source-1', 'source-2'])
    .some((item) => item.code === 'outline.sourceCoverage'))
  const unsupportedChart = structuredClone(specs)
  const chartPlan = structuredClone(plan)
  chartPlan.sections[0]!.pages[1]!.visualType = 'chart'
  unsupportedChart[1]!.visualType = 'chart'
  unsupportedChart[1]!.elements[0]!.value = 2026
  assert.ok(validateSlideSpecs(unsupportedChart, chartPlan, [evidence])
    .some((item) => item.code === 'slide.chartValueEvidence'))
  assert.equal(visibleTextUnits('系统 system design 2026'), 5)
})

test('compiled lecture deck is offline, script-hash constrained and preserves the spatial runtime fixes', () => {
  const first = compileLectureDeck({ title: plan.title, specs, evidence: [evidence], generatedAt: '2026-08-31T00:00:00.000Z' })
  const replay = compileLectureDeck({ title: plan.title, specs, evidence: [evidence], generatedAt: '2026-08-31T00:00:00.000Z' })
  assert.equal(first.sha256, replay.sha256)
  assert.equal(first.manifest.pageCount, 5)
  assert.equal(first.manifest.stepCount, 9)
  assert.match(first.html, /perspective:1500px/)
  assert.match(first.html, /translate3d\(0,0,-92px\)/)
  assert.match(first.html, /pendingSlideLoad\?\.cancel\?\.\(\)/)
  assert.match(first.html, /run !== renderRun \|\| stepIndex !== targetStep/)
  assert.match(first.html, /sandbox=""/)
  assert.match(first.html, /script-src 'sha256-[A-Za-z0-9+/=]+'/)
  assert.match(first.html, /connect-src 'none'/)
  assert.doesNotMatch(first.html, /https?:\/\//)
})

test('image slides embed only an authorized source data URI and omit internal asset identifiers', () => {
  const imagePlan = structuredClone(plan)
  imagePlan.sections[0]!.pages[1]!.visualType = 'image'
  const imageSpecs = structuredClone(specs)
  imageSpecs[1]!.visualType = 'image'
  imageSpecs[1]!.sourceAssetId = 'local-asset-1'
  const assets = [{
    sourceId: evidence.sourceId,
    assetId: 'local-asset-1',
    mimeType: 'image/png' as const,
    dataUri: 'data:image/png;base64,iVBORw0KGgo=',
    pageNumber: 3,
    sectionTitle: '架构',
    width: 640,
    height: 360,
  }]
  assert.deepEqual(validateSlideSpecs(imageSpecs, imagePlan, [evidence], assets), [])
  const compiled = compileLectureDeck({
    title: imagePlan.title,
    specs: imageSpecs,
    evidence: [evidence],
    assets,
    generatedAt: '2026-08-31T00:00:00.000Z',
  })
  assert.match(compiled.html, /data:image\/png;base64,iVBORw0KGgo=/)
  assert.doesNotMatch(compiled.html, /local-asset-1/)
})

function captureDb(rows: unknown[] = [], rowCount = rows.length) {
  const calls: Array<{ text: string; params?: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params) => {
      calls.push({ text, params })
      return { rows, rowCount } as never
    },
  }
  return { db, calls }
}

test('presentation repository scopes access and mutations by tenant, member and job fence', async () => {
  const accessibleCalls: Array<{ text: string; params?: readonly unknown[] }> = []
  const accessible: { db: Queryable; calls: typeof accessibleCalls } = {
    calls: accessibleCalls,
    db: {
      query: async (text, params) => {
        accessibleCalls.push({ text, params })
        if (text.includes('SELECT project_id FROM presentations')) {
          return { rows: [{ project_id: 'project-a' }], rowCount: 1 } as never
        }
        if (text.includes('SELECT 1 FROM project_memberships')) {
          return { rows: [{ active: 1 }], rowCount: 1 } as never
        }
        return { rows: [], rowCount: 0 } as never
      },
    },
  }
  assert.equal(await findAccessiblePresentation(accessible.db, {
    companyId: 'company-a', presentationId: 'presentation-a', authorizationUserId: 'user-a',
  }), null)
  const accessQuery = accessible.calls.find((call) => call.text.includes('SELECT presentation.*'))!.text
  assert.match(accessQuery, /presentation\.company_id=\$2/)
  assert.doesNotMatch(accessQuery, /project_memberships/)
  assert.match(accessQuery, /visibility_scope='PROJECT' OR presentation\.authorization_user_id=\$3/)

  const sourceScope = captureDb([{ project_id: 'project-a', id: 'source-a', title: 'A', visibility_scope: 'PROJECT', status: 'ready', external_source_id: 'external-secret' }])
  const resolved = await resolvePresentationCreationScope(sourceScope.db, {
    companyId: 'company-a', conversationId: 'conversation-a', authorizationUserId: 'user-a',
  })
  assert.equal(resolved.sources[0]?.externalSourceId, 'external-secret')
  assert.match(sourceScope.calls[0]!.text, /conversation_source_exclusions/)
  assert.match(sourceScope.calls[0]!.text, /source\.owner_user_id=\$3/)

  const direct = captureDb([{ channel_id: 'private-dm' }])
  assert.equal(await findPrivatePresentationDeliveryChannel(direct.db, {
    companyId: 'company-a', projectId: 'project-a', authorizationUserId: 'user-a', agentId: 'nova',
  }), 'private-dm')
  const directQuery = direct.calls.find((call) => call.text.includes("conversation.kind='direct'"))!.text
  assert.match(directQuery, /conversation\.kind='direct'/)
  assert.match(directQuery, /conversation\.members=to_jsonb\(ARRAY\[\$3::text,\$4::text\]\)/)
  assert.match(directQuery, /JOIN im_channel_bindings binding/)
  assert.match(directQuery, /conversation\.company_id=\$1 AND conversation\.project_id=\$2/)

  const mutation = captureDb([], 1)
  await updatePresentationForClaim(mutation.db, {
    id: 'job-a', companyId: 'company-a', presentationId: 'presentation-a', kind: 'initial',
    stage: 'planning', checkpoint: {}, attempts: 1, leaseToken: 'lease-a', leaseFence: 7,
  }, { status: 'planning' })
  assert.match(mutation.calls[0]!.text, /job\.lease_token=\$3/)
  assert.match(mutation.calls[0]!.text, /job\.lease_fence=\$4/)
})

test('expired presentation work is reclaimed with a monotonically increasing fence', async () => {
  const capture = captureDb()
  assert.equal(await claimPresentationJob(capture.db, new Date('2026-08-31T00:00:00Z'), 'lease-a'), null)
  assert.match(capture.calls[0]!.text, /FOR UPDATE SKIP LOCKED LIMIT 1/)
  assert.match(capture.calls[0]!.text, /status='running' AND lease_expires_at<=\$1/)
  assert.match(capture.calls[0]!.text, /lease_fence=job\.lease_fence\+1/)
})

test('outline shortening and ContentIR persistence remain atomic and fenced', async () => {
  const revisionCalls: Array<{ text: string; params?: readonly unknown[] }> = []
  const revision: { db: Queryable; calls: typeof revisionCalls } = {
    calls: revisionCalls,
    db: {
      query: async (text, params) => {
        revisionCalls.push({ text, params })
        if (text.includes('SELECT project_id FROM presentations')) {
          return { rows: [{ project_id: 'project-a' }], rowCount: 1 } as never
        }
        if (text.includes('SELECT 1 FROM project_memberships')) {
          return { rows: [{ active: 1 }], rowCount: 1 } as never
        }
        return { rows: [], rowCount: 1 } as never
      },
    },
  }
  assert.equal(await requestPresentationOutlineRevision(revision.db, {
    companyId: 'company-a', presentationId: 'presentation-a', authorizationUserId: 'user-a',
    expectedRevision: 0, targetSlideCount: 12,
  }), true)
  const revisionQuery = revision.calls.find((call) => call.text.includes('target_page_count=COALESCE'))!
  assert.match(revisionQuery.text, /presentation\.status='needsAttention'/)
  assert.deepEqual(revisionQuery.params?.slice(3), [0, 12])

  const persisted: Array<{ text: string; params?: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params) => {
      persisted.push({ text, params })
      return { rows: text.startsWith('SELECT 1') ? [{ ok: 1 }] : [], rowCount: 1 } as never
    },
  }
  const claim = {
    id: 'job-a', companyId: 'company-a', presentationId: 'presentation-a', kind: 'initial' as const,
    stage: 'generating', checkpoint: {}, attempts: 1, leaseToken: 'lease-a', leaseFence: 1,
  }
  await upsertPresentationPage(db, claim, {
    id: pages[1]!.id, pageNumber: pages[1]!.pageNumber, plan: pages[1]!,
    contentIr: contentIRFromSlideSpec(specs[1]!), slideSpec: specs[1]!, qualityIssues: [], status: 'validated',
  })
  assert.match(persisted[1]!.text, /plan,content_ir,slide_spec/)
  assert.match(persisted[1]!.text, /content_ir=EXCLUDED\.content_ir/)
  assert.equal(presentationPageNeedsGeneration(specs[1], new Set(['content-2']), 'content-1'), false)
  assert.equal(presentationPageNeedsGeneration(specs[1], new Set(['content-1']), 'content-1'), true)
  assert.equal(presentationPageNeedsGeneration(null, new Set(), 'content-1'), true)
  assert.equal(presentationRevisionAllowsPage(new Set(['content-1']), 'content-2'), false)
  assert.equal(presentationRevisionAllowsPage(null, 'content-2'), true)
})

test('Agent access to a PRIVATE presentation returns only an opaque direct-delivery handle', async () => {
  const row = {
    id: 'presentation-private', company_id: 'company-a', project_id: 'project-a', conversation_id: 'conversation-a',
    authorization_user_id: 'user-a', visibility_scope: 'PRIVATE', title: '不得泄露的标题', request_text: 'secret',
    target_page_count: 24, recommended_page_count: null, source_snapshot: [{ sourceId: 'source-a', title: '私有资料', visibilityScope: 'PRIVATE', status: 'ready' }],
    outline: null, outline_revision: 0, status: 'planning', latest_version_id: null, artifact_client_msg_no: null,
    error: null, created_at: new Date('2026-08-31T00:00:00Z'), updated_at: new Date('2026-08-31T00:00:00Z'),
    version_id: null, version_company_id: null, version_presentation_id: null, version_number: null,
    storage_key: null, sha256: null, size_bytes: null, manifest: null, quality_report: null,
    runtime_version: null, renderer_version: null, version_created_at: null,
  }
  const database = captureDb([row])
  const application = new PresentationsApplication({
    db: database.db, transaction: async (work) => work(database.db),
    storage: { readObject: async () => Buffer.alloc(0) }, enabled: () => true,
    sendArtifactCard: async () => { throw new Error('PRIVATE presentation must not emit a group card') },
  })
  const work: AgentWorkItem = {
    id: 'work-a', fence: 1, companyId: 'company-a', authorizationUserId: 'user-a', agentId: 'nova',
    channelId: 'conversation-a', triggerClientMsgNo: 'trigger-a', reason: 'message', executionRole: 'coordinator',
    lane: 'learner', leaseToken: 'lease-a',
  }
  assert.deepEqual(await application.getForAgent(work, 'presentation-private'), {
    id: 'presentation-private', status: 'planning', visibilityScope: 'PRIVATE', deliveryState: 'privateDirect',
  })
})

test('create idempotency replay reuses the exact same Artifact card nonce', async () => {
  const agentId = 'nova'
  const row = {
    id: 'presentation-replay', company_id: 'company-a', project_id: 'project-a', conversation_id: 'conversation-a',
    authorization_user_id: 'user-a', visibility_scope: 'PROJECT', title: '可公开标题', request_text: '生成演示',
    target_page_count: 24, recommended_page_count: null,
    source_snapshot: [{ sourceId: 'source-a', title: '项目资料', visibilityScope: 'PROJECT', status: 'ready' }],
    outline: null, outline_revision: 0, status: 'planning', latest_version_id: null,
    artifact_client_msg_no: `presentation-card-presentation-replay-${createHash('sha256').update(agentId).digest('hex').slice(0, 16)}`,
    error: null, created_at: new Date('2026-08-31T00:00:00Z'), updated_at: new Date('2026-08-31T00:00:00Z'),
  }
  const database = captureDb([row])
  const cards: Array<{ clientMsgNo: string; channelId: string }> = []
  const application = new PresentationsApplication({
    db: database.db,
    transaction: async (work) => work(database.db),
    storage: { readObject: async () => Buffer.alloc(0) },
    enabled: () => true,
    sendArtifactCard: async (input) => { cards.push({ clientMsgNo: input.clientMsgNo, channelId: input.channelId }) },
  })
  const work = {
    id: 'work-replay', fence: 1, companyId: 'company-a', authorizationUserId: 'user-a', agentId,
    channelId: 'conversation-a', triggerClientMsgNo: 'trigger-a', reason: 'message', executionRole: 'coordinator',
    lane: 'learner', leaseToken: 'lease-a',
  } as AgentWorkItem
  const request = { idempotencyKey: 'same-create', requirements: '生成演示', targetSlideCount: 24 }
  await application.createForAgent(work, request)
  await application.createForAgent(work, request)
  assert.deepEqual(cards, [
    { clientMsgNo: row.artifact_client_msg_no, channelId: 'conversation-a' },
    { clientMsgNo: row.artifact_client_msg_no, channelId: 'conversation-a' },
  ])
})

test('retry preserves outline-revision planning and cannot bypass explicit shortening acceptance', async () => {
  const now = new Date('2026-08-31T00:00:00Z')
  const presentation = {
    id: 'presentation-outline-retry', company_id: 'company-a', project_id: 'project-a', conversation_id: 'conversation-a',
    authorization_user_id: 'user-a', visibility_scope: 'PROJECT', title: plan.title, request_text: '修订大纲',
    target_page_count: 5, recommended_page_count: 5, source_snapshot: [{
      sourceId: 'source-1', title: evidence.sourceTitle, visibilityScope: 'PROJECT', status: 'ready',
    }],
    outline: plan, outline_revision: 2, status: 'needsAttention', latest_version_id: null,
    artifact_client_msg_no: 'presentation-card-outline', error: 'outline quality gate', created_at: now, updated_at: now,
    version_id: null, version_company_id: null, version_presentation_id: null, version_number: null,
    storage_key: null, sha256: null, size_bytes: null, manifest: null, quality_report: null,
    runtime_version: null, renderer_version: null, version_created_at: null,
  }
  const calls: Array<{ text: string; params?: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params) => {
      calls.push({ text, params })
      if (text.includes('SELECT project_id FROM presentations')) return { rows: [{ project_id: 'project-a' }], rowCount: 1 } as never
      if (text.includes('SELECT 1 FROM project_memberships')) return { rows: [{ active: 1 }], rowCount: 1 } as never
      if (text.includes('SELECT presentation.*')) return { rows: [presentation], rowCount: 1 } as never
      if (text.includes('SELECT kind,stage,checkpoint')) {
        return { rows: [{ kind: 'outlineRevision', stage: 'needsAttention', checkpoint: { attentionFromStage: 'planning' } }], rowCount: 1 } as never
      }
      return { rows: [], rowCount: 1 } as never
    },
  }
  const application = new PresentationsApplication({
    db, transaction: async (work) => work(db), storage: { readObject: async () => Buffer.alloc(0) },
    enabled: () => true, sendArtifactCard: async () => undefined,
  })
  await application.retry('company-a', 'user-a', presentation.id, { idempotencyKey: 'retry-outline' })
  const inserted = calls.find((call) => call.text.includes('INSERT INTO presentation_jobs'))
  assert.equal(inserted?.params?.[3], 'outlineRevision')
  assert.equal(inserted?.params?.[4], 'planning')

  const shortened = { ...presentation, target_page_count: 24, recommended_page_count: 12 }
  const shortenedDb: Queryable = {
    query: async () => ({ rows: [shortened], rowCount: 1 } as never),
  }
  const shorteningApplication = new PresentationsApplication({
    db: shortenedDb, transaction: async (work) => work(shortenedDb), storage: { readObject: async () => Buffer.alloc(0) },
    enabled: () => true, sendArtifactCard: async () => undefined,
  })
  await assert.rejects(
    () => shorteningApplication.retry('company-a', 'user-a', presentation.id, { idempotencyKey: 'retry-shortcut' }),
    (error: unknown) => error instanceof PresentationApplicationError && error.code === 'invalid_state',
  )
})

test('content/publication gate failures are non-transient while provider outages are retryable', () => {
  assert.equal(isTransientPresentationError(new ContentGenerationError('invalid content')), false)
  assert.equal(isTransientPresentationError(new PublicationAttentionError('attention required')), false)
  assert.equal(isTransientPresentationError(Object.assign(new Error('rate limited'), { status: 429 })), true)
  assert.equal(isTransientPresentationError(Object.assign(new Error('socket reset'), { code: 'ECONNRESET' })), true)
  assert.equal(isTransientPresentationError(new Error('program invariant failed')), false)
})

test('feature flag disables generation before any persistence or provider side effect', async () => {
  const database = captureDb()
  const application = new PresentationsApplication({
    db: database.db, transaction: async (work) => work(database.db),
    storage: { readObject: async () => Buffer.alloc(0) }, enabled: () => false, sendArtifactCard: async () => undefined,
  })
  const work = { id: 'work', fence: 1, companyId: 'company', authorizationUserId: 'user', agentId: 'nova', channelId: 'channel',
    triggerClientMsgNo: 'trigger', reason: 'message', executionRole: 'coordinator', lane: 'learner', leaseToken: 'lease' } as AgentWorkItem
  await assert.rejects(() => application.createForAgent(work, {
    idempotencyKey: 'request-a', requirements: '生成一份系统讲解', targetSlideCount: 24,
  }), (error: unknown) => error instanceof PresentationApplicationError && error.code === 'feature_disabled')
  assert.equal(database.calls.length, 0)
})

test('artifact reads reject a same-size object whose immutable SHA-256 does not match', async () => {
  const now = new Date('2026-08-31T00:00:00Z')
  const presentation = {
    id: 'presentation-a', company_id: 'company-a', project_id: 'project-a', conversation_id: 'conversation-a',
    authorization_user_id: 'user-a', visibility_scope: 'PROJECT', title: '演示', request_text: 'requirements',
    target_page_count: 24, recommended_page_count: 24,
    source_snapshot: [{ sourceId: 'source-a', title: '资料', visibilityScope: 'PROJECT', status: 'ready' }],
    outline: null, outline_revision: 1, status: 'ready', latest_version_id: 'version-a', artifact_client_msg_no: 'card-a',
    error: null, created_at: now, updated_at: now, version_id: null, version_company_id: null,
    version_presentation_id: null, version_number: null, storage_key: null, sha256: null, size_bytes: null,
    manifest: null, quality_report: null, runtime_version: null, renderer_version: null, version_created_at: null,
  }
  const version = {
    id: 'version-a', company_id: 'company-a', presentation_id: 'presentation-a', version_number: 1,
    storage_key: 'presentation-artifacts/company-a/presentation-a/1/deck.html',
    sha256: createHash('sha256').update('original').digest('hex'), size_bytes: 8,
    manifest: { schemaVersion: 'lecture_deck_manifest_v1', title: '演示', pageCount: 24, stepCount: 48,
      sourceCount: 1, runtimeVersion: 'runtime', rendererVersion: 'renderer', generatedAt: now.toISOString() },
    quality_report: {}, runtime_version: 'runtime', renderer_version: 'renderer', created_at: now,
  }
  const db: Queryable = {
    query: async (text) => ({
      rows: text.includes('SELECT version.*') ? [version] : [presentation], rowCount: 1,
    } as never),
  }
  const application = new PresentationsApplication({
    db, transaction: async (work) => work(db), storage: { readObject: async () => Buffer.from('tampered') },
    enabled: () => true, sendArtifactCard: async () => undefined,
  })
  await assert.rejects(
    () => application.readVersion('company-a', 'user-a', 'presentation-a', 'version-a'),
    /checksum does not match/,
  )
})

test('presentation artifact GC deletes only old unreferenced objects under its exact prefix', async () => {
  const deleted: string[] = []
  const db: Queryable = {
    query: async () => ({ rows: [{ storage_key: 'presentation-artifacts/company-a/referenced/1/deck.html' }], rowCount: 1 } as never),
  }
  const gc = createPresentationStorageGc({
    db,
    storage: {
      listObjectsByPrefix: async (prefix) => {
        assert.equal(prefix, 'presentation-artifacts/')
        return [
          { key: 'presentation-artifacts/company-a/referenced/1/deck.html', sizeBytes: 1, lastModifiedMs: 0 },
          { key: 'presentation-artifacts/company-a/recent/1/deck.html', sizeBytes: 1, lastModifiedMs: Date.parse('2026-08-30T12:00:00Z') },
          { key: 'presentation-artifacts/company-a/orphan/1/deck.html', sizeBytes: 1, lastModifiedMs: Date.parse('2026-08-01T00:00:00Z') },
        ]
      },
      deleteObject: async (key) => { deleted.push(key); return true },
    },
  })
  assert.deepEqual(await gc.runOnce(new Date('2026-08-31T00:00:00Z')), { inspected: 3, deleted: 1 })
  assert.deepEqual(deleted, ['presentation-artifacts/company-a/orphan/1/deck.html'])
})
