import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvidenceItemV1, SlideSpecV1 } from './contracts.js'
import { compileLectureDeck } from './renderer.js'
import {
  PRESENTATION_STATIC_REPORT_SCHEMA_VERSION,
  validatePresentationHtml,
} from './static-validator.js'

const evidence: EvidenceItemV1[] = [{
  schemaVersion: 'evidence_item_v1',
  id: 'evidence-1',
  sourceId: 'source-1',
  sourceTitle: '课程资料',
  chunkId: 'chunk-1',
  pageNumber: 3,
  sectionTitle: '核心机制',
  excerpt: '输入经过检索、规划与验证后形成可发布演示。',
  claim: '生成链路包含检索、规划与验证。',
  marker: 'S1',
  position: 0,
}]

const specs: SlideSpecV1[] = [
  {
    schemaVersion: 'slide_spec_v1', id: 'opening', pageNumber: 1, kind: 'opening',
    title: '可信演示', conclusion: '从资料到结论', visualType: 'diagram',
    sourceAssetId: null,
    elements: [], relations: [], anchors: [], evidenceIds: [], sourceMarkers: [],
  },
  {
    schemaVersion: 'slide_spec_v1', id: 'content', pageNumber: 2, kind: 'content',
    title: '证据链控制内容质量', conclusion: '每个结论都能回到资料位置', visualType: 'process',
    sourceAssetId: null,
    elements: [
      { id: 'retrieval', label: '检索证据', detail: '限定来源', value: null, group: null },
      { id: 'validation', label: '确定性验证', detail: '发布门禁', value: null, group: null },
    ],
    relations: [{ from: 'retrieval', to: 'validation', label: '约束' }],
    anchors: [
      { id: 'zoom-retrieval', label: '检索', targetElementId: 'retrieval', panel: { observation: '先检索', reason: '绑定来源', meaning: '降低幻觉' } },
      { id: 'zoom-validation', label: '验证', targetElementId: 'validation', panel: { observation: '再验证', reason: '固定门禁', meaning: '稳定发布' } },
    ],
    evidenceIds: ['evidence-1'], sourceMarkers: ['S1'],
  },
  {
    schemaVersion: 'slide_spec_v1', id: 'sources', pageNumber: 3, kind: 'sources',
    title: '资料索引', conclusion: '本演示仅使用已授权资料', visualType: 'table',
    sourceAssetId: null,
    elements: [], relations: [], anchors: [], evidenceIds: ['evidence-1'], sourceMarkers: ['S1'],
  },
  {
    schemaVersion: 'slide_spec_v1', id: 'closing', pageNumber: 4, kind: 'closing',
    title: '结束', conclusion: '回到证据继续讨论', visualType: 'diagram',
    sourceAssetId: null,
    elements: [], relations: [], anchors: [], evidenceIds: [], sourceMarkers: [],
  },
]

function fixtureHtml(): string {
  return compileLectureDeck({
    title: '可信演示',
    specs,
    evidence,
    generatedAt: '2026-08-31T00:00:00.000Z',
  }).html
}

function issueCodes(html: string): string[] {
  return validatePresentationHtml(html).issues.map((issue) => issue.code)
}

test('compiled lecture deck passes a deterministic browser-free publication gate', () => {
  const html = fixtureHtml()
  const first = validatePresentationHtml(html)
  const second = validatePresentationHtml(html)

  assert.deepEqual(first, second)
  assert.equal(first.schemaVersion, PRESENTATION_STATIC_REPORT_SCHEMA_VERSION)
  assert.equal(first.passed, true, JSON.stringify(first.issues, null, 2))
  assert.deepEqual(first.metrics, {
    slideCount: 4,
    contentSlideCount: 1,
    stepCount: 6,
    anchorCount: 2,
    executableScriptCount: 1,
    iframeCount: 1,
  })
  assert.equal(first.checks.every((check) => check.passed), true)
})

test('sandbox escalation and external resources are rejected', () => {
  const html = fixtureHtml()
    .replace('sandbox=""', 'sandbox="allow-same-origin allow-popups"')
    .replace('</head>', '<link rel="stylesheet" href="https://example.invalid/deck.css"></head>')
  const codes = issueCodes(html)

  assert.equal(codes.includes('iframe.sandbox.capability'), true)
  assert.equal(codes.includes('html.externalResource'), true)
})

test('runtime tampering breaks both the pinned race guard and its CSP hash', () => {
  const html = fixtureHtml().replace(
    'if (run !== renderRun || stepIndex !== targetStep) return;',
    'if (stepIndex !== targetStep) return;',
  )
  const codes = issueCodes(html)

  assert.equal(codes.includes('runtime.load.guard'), true)
  assert.equal(codes.includes('csp.scriptHash.mismatch'), true)
})

test('script-bearing slide srcdoc and unsafe zoom geometry cannot pass', () => {
  const html = fixtureHtml()
  const match = /<script id="deck-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(match)
  const data = JSON.parse(match[1]!) as { slides: Array<{ html: string; anchors: Array<{ rect: { x: number } }> }> }
  data.slides[1]!.html = data.slides[1]!.html.replace('</body>', '<script>alert(1)</script></body>')
  data.slides[1]!.anchors[0]!.rect.x = 4
  const safeJson = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
  const mutated = html.replace(match[1]!, safeJson)
  const codes = issueCodes(mutated)

  assert.equal(codes.includes('slide.activeScript'), true)
  assert.equal(codes.includes('slide.anchor.safeArea'), true)
})
