import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  parsePresentationArtifact,
  parsePresentationDetail,
  parsePresentationVersionList,
} from './contracts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const version = {
  schemaVersion: 'presentation_version_v1',
  id: 'version-1',
  versionNumber: 1,
  pageCount: 24,
  sizeBytes: 42_000,
  sha256: 'abc',
  runtimeVersion: '1.4.0',
  rendererVersion: '1.0.0',
  createdAt: '2026-08-31T00:00:00.000Z',
}

const outline = {
  schemaVersion: 'deck_plan_v1',
  title: '可信演示',
  subtitle: '只使用资料',
  audience: '学习者',
  objective: '建立整体理解',
  language: 'zh-CN',
  targetPageCount: 24,
  sourceCoverage: {
    selectedSourceCount: 2,
    readySourceCount: 2,
    coveredSourceIds: ['source-1', 'source-2'],
    uncoveredSourceIds: [],
    coverageRatio: 1,
  },
  sections: [{
    id: 'section-1',
    title: '第一章',
    objective: '理解概念',
    summary: '从问题进入概念',
    pages: [{
      id: 'page-1',
      pageNumber: 1,
      kind: 'opening',
      title: '开场',
      conclusion: '问题值得研究',
      visualType: 'conceptMap',
      evidenceIds: ['evidence-1'],
      sourceIds: ['source-1'],
      zoomPointCount: 2,
    }],
  }],
}

const detail = {
  schemaVersion: 'presentation_detail_v1',
  id: 'presentation-1',
  title: '可信演示',
  status: 'awaitingOutlineApproval',
  visibilityScope: 'PROJECT',
  requestText: '生成长篇演示',
  targetPageCount: 24,
  recommendedPageCount: null,
  outlineRevision: 3,
  outline,
  sourceSnapshot: [{ sourceId: 'source-1', title: '资料一', visibilityScope: 'PROJECT' }],
  latestVersion: version,
  error: null,
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
}

test('presentation boundaries accept only explicit v1 schema versions', () => {
  assert.deepEqual(parsePresentationDetail({ presentation: detail }), detail)
  assert.deepEqual(parsePresentationVersionList({
    schemaVersion: 'presentation_version_list_v1',
    versions: [version],
  }).versions, [version])
  assert.throws(
    () => parsePresentationDetail({ ...detail, schemaVersion: 'presentation_detail_v2' }),
    /版本不受支持/,
  )
  assert.throws(
    () => parsePresentationDetail({ ...detail, outline: { ...outline, schemaVersion: 'deck_plan_v2' } }),
    /版本不受支持/,
  )
})

test('lecture deck artifacts fail closed', () => {
  assert.deepEqual(parsePresentationArtifact({
    artifactId: 'presentation-1',
    artifactKind: 'lecture_deck_html',
    title: '课程演示',
  }), {
    artifactId: 'presentation-1',
    artifactKind: 'lecture_deck_html',
    title: '课程演示',
  })
  assert.equal(parsePresentationArtifact({ artifactId: 'x', artifactKind: 'other' }), null)
})

test('presentation resources preserve exclusive loading, error, empty, and ready branches', () => {
  const drawer = read('./components/PresentationDrawerContent.tsx')
  const card = read('./components/PresentationArtifactCard.tsx')
  assert.match(drawer, /loading && !presentation[\s\S]*?<ResourceSkeleton/)
  assert.match(drawer, /error && !presentation[\s\S]*?role="alert"/)
  assert.match(drawer, /loaded && !presentation[\s\S]*?演示不可用/)
  assert.match(drawer, /presentation\.status === 'ready'[\s\S]*?<PresentationViewer/)
  assert.match(card, /loading && !presentation[\s\S]*?<ResourceSkeleton/)
})

test('outline approval uses revision fencing, sensitive confirmation, and lifecycle Toast', () => {
  const drawer = read('./components/PresentationDrawerContent.tsx')
  const api = read('./api.ts')
  assert.match(drawer, /confirmSensitiveAction\(/)
  assert.match(drawer, /toastAction\(approveOutline\(presentation\.id, presentation\.outlineRevision\)/)
  assert.match(api, /JSON\.stringify\(\{ expectedRevision \}\)/)
})

test('the active viewer runs only authenticated Blob HTML in a script-only sandbox', () => {
  const viewer = read('./components/PresentationViewer.tsx')
  const html = read('./html.ts')
  const api = read('./api.ts')
  assert.match(viewer, /sandbox="allow-scripts"/)
  assert.doesNotMatch(viewer, /allow-same-origin/)
  assert.match(viewer, /referrerPolicy="no-referrer"/)
  assert.match(html, /presentationsApi\.getVersionContent/)
  assert.match(api, /credentials:\s*'include'/)
  assert.doesNotMatch(api, /authorization|Bearer/)
  assert.match(api, /content-type[\s\S]*text\/html/)
})
