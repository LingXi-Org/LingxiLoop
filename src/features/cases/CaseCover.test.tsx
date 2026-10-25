import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CaseCoverDescriptor } from './CaseCover'

mock.module('@/api/core/http', { namedExports: { http: async () => { throw new Error('static render must not fetch') } } })
mock.module('@/stores/theme', { namedExports: { useTheme: () => ({ theme: 'light' }) } })
const { CaseCover, caseCoverIdentity, caseCoverPending } = await import('./CaseCover')

const cover: CaseCoverDescriptor = {
  schemaVersion: 1, status: 'ready', fingerprint: 'synthetic', generation: 2,
  alt: '可以拉开抽屉的知识收纳柜', previewUrl: '/api/cases/a/cover/assets/j/2/preview?snapshot=published',
  interactiveUrl: '/api/cases/a/cover/assets/j/2/interactive?snapshot=published', canRetry: false,
}

test('initial rendering crops a 5:4 source and never injects generated code into the app', () => {
  const html = renderToStaticMarkup(<CaseCover cover={cover} title="知识整理" scopeKey="company:reader" fallbackUrl="/manual.png" />)
  assert.match(html, /aspect-\[5\/4\]/); assert.match(html, /width="400" height="320"/)
  assert.match(html, /object-cover/); assert.match(html, /可以拉开抽屉的知识收纳柜/)
  assert.match(html, /assets\/j\/2\/preview/); assert.doesNotMatch(html, /<iframe|<script|srcDoc|manual\.png/)
})

test('teacher failures retain original cover and expose only a stable retry callback', () => {
  const failed = { ...cover, status: 'failed' as const, previewUrl: null, interactiveUrl: null, canRetry: true }
  const html = renderToStaticMarkup(<CaseCover cover={failed} title="知识整理" scopeKey="company:teacher" fallbackUrl="/manual.png" onRetry={async () => undefined} />)
  assert.match(html, /manual\.png/); assert.match(html, /重试封面/)
  assert.match(html, /alt="知识整理的案例封面"/)
  assert.doesNotMatch(html, /fingerprint|synthetic|stack|prompt/)
  const student = renderToStaticMarkup(<CaseCover cover={{ ...failed, canRetry: false }} title="知识整理" scopeKey="company:reader" />)
  assert.doesNotMatch(student, /重试封面/)
})

test('generation identity is independent of article row versions and pending status stays explicit', () => {
  assert.notEqual(caseCoverIdentity(cover), caseCoverIdentity({ ...cover, generation: 3 }))
  assert.notEqual(caseCoverIdentity(cover), caseCoverIdentity({ ...cover, fingerprint: 'next-draft' }))
  assert.equal(caseCoverPending(cover), false)
  assert.equal(caseCoverPending({ ...cover, status: 'generating' }), true)
  assert.equal(caseCoverPending(null), false)
})


test('pending generation keeps the previous picture and exposes local loading and refresh', () => {
  const html = renderToStaticMarkup(<CaseCover cover={{ ...cover, status: 'generating' }} title="知识整理" scopeKey="org" onRefresh={() => undefined} />)
  assert.match(html, /assets\/j\/2\/preview/)
  assert.match(html, /role="status"[^>]*>.*生成中/)
  assert.match(html, /aria-label="刷新封面状态"/)
  assert.doesNotMatch(html, /交互封面|静止|sr-only[^>]*>封面正在生成/)
})

test('management retry follows page busy and an unsaved cover stays neutral', () => {
  const html = renderToStaticMarkup(<CaseCover cover={{ ...cover, status: 'failed', canRetry: true }} title="知识整理" scopeKey="org" busy onRetry={async () => undefined} />)
  assert.match(html, /<button[^>]*disabled=""[^>]*>重试封面/)
  const neutral = renderToStaticMarkup(<CaseCover title="新案例" scopeKey="org" />)
  assert.doesNotMatch(neutral, /上传|添加|生成中|等待生成/)
  assert.match(neutral, /role="img"/)
})
