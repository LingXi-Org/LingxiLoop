import assert from 'node:assert/strict'
import { test, mock, before, after } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
before(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'zh-CN' } } }))
after(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

const defaultState = { page: null, supported: true, online: true, error: undefined as string | undefined }
let state = { ...defaultState }
mock.module('../../hooks/useGenUi.js', { namedExports: { useGenUi: () => state } })
mock.module('@/stores/auth', { namedExports: { useAuth: (select: (state: unknown) => unknown) => select({ user: null, activeCompanyId: null }) } })
mock.module('@/features/chat/drafts', { namedExports: { readComposerDraft: () => null, saveComposerDraft: () => {} } })
const { GenUiCard } = await import('./GenUiCard.js')
const render = () => renderToStaticMarkup(<GenUiCard target={{ workspacePath: 'project', sessionId: 'room', path: '/work/view.html', instanceKey: 'view' }} reference={{ path: '/work/view.html' }} />)

test('card acquisition has a skeleton, while offline, unsupported and failed acquisition stop it', () => {
  state = { page: null, supported: true, online: true, error: undefined }
  assert.match(render(), /data-gen-ui-loading/)
  for (const [patch, label, retry] of [
    [{ online: false }, '工作区已离线', true],
    [{ supported: false }, '此浏览器不支持', false],
    [{ error: 'Synthetic acquisition failure' }, '无法加载交互视图', true],
  ] as const) {
    state = { ...defaultState, ...patch }
    const html = render()
    assert.doesNotMatch(html, /data-gen-ui-loading|aria-busy="true"/)
    assert.ok(html.includes(label))
    assert.equal(html.includes('重试'), retry)
  }
})
