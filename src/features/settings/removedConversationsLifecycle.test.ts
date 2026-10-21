import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Failure model: closing content may remain mounted for its exit animation;
// reopening before restore acceptance reads a row that later needs invalidation;
// invalidating a read must not fence its still-visible mutation/pending state;
// old-scope acceptance must never invalidate the new scope. No browser/network.
// Actual stores and component are compiled below. Hooks model explicit render,
// effect and cleanup boundaries; these are not browser/DOM integration claims.
const require = createRequire(import.meta.url)
const { createStore } = require('zustand/vanilla')
type Node = { type: unknown; props: Record<string, any> }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
function load(path: string, modules: Record<string, unknown>) {
  const exports: Record<string, any> = {}
  const code = ts.transpileModule(source(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  runInNewContext(code, { exports, AbortController, require: (name: string) => {
    assert.ok(name in modules, `Unexpected import ${name}`)
    return modules[name]
  } }, { filename: path })
  return exports
}
function fixture(twoRows = false) {
  let projectId = 'p', fail = false, held = true, holdReload = false
  let release!: () => void, releaseReload!: () => void
  const row = (id: string) => ({ id, title: id, kind: 'direct', members: ['u'], unreadCount: 0, updatedAt: new Date(0).toISOString() })
  const rows = new Map([['p', twoRows ? [row('a'), row('b')] : [row('a')]], ['other', [row('other')]]])
  const reads: string[] = [], notifications: unknown[] = []
  const create = (init: unknown) => {
    const api = createStore(init)
    return Object.assign((selector: (state: any) => unknown) => selector(api.getState()), api)
  }
  const api = {
    getRemovedConversations: async () => { reads.push(projectId); return [...rows.get(projectId)!] },
    restoreConversation: async (id: string) => {
      const target = projectId
      if (held) await new Promise<void>(resolve => { release = resolve })
      if (fail) throw new Error('synthetic failure')
      rows.set(target, rows.get(target)!.filter(item => item.id !== id))
    },
    getConversations: async () => { if (holdReload) await new Promise<void>(resolve => { releaseReload = resolve }); return [] },
  }
  const settings = load('./store.ts', { zustand: { create } }).useSettingsDialog
  const conversations = load('../conversations/store.ts', {
    zustand: { create }, './api': { conversationsApi: api },
    '@/api/core/realtime': { ws: { connect() {}, on() {} } },
    '@/stores/app': { useApp: { getState: () => ({}), setState() {} } },
    '@/stores/surface': { useSurface: { getState: () => ({ closeForConversationChange() {} }) } },
    '@/stores/auth': { useAuth: { getState: () => ({ user: { id: 'u' }, activeCompanyId: 'c' }) } },
    '@/features/chat/runtime/transport': { chatTransport: { setWorkspaceChannels() {}, reloadConversation() {} } },
    '@/features/chat/runtime/latency': { chatLatency: { opened() {} } },
    '@/features/chat/runtime/store': { useChatThreadStore: { getState: () => ({ conversations: {} }) } },
    '@/features/agents/state': { useParticipants: { getState: () => ({ byId: {} }) } },
    '@/lib/workspaceSession': { getWorkspaceSession: () => ({ companyId: 'c', projectId }) },
    '@/lib/userFacingError': { userFacingError: () => 'error' },
    '@/lib/webNavigation': { writeWebDestination() {} },
  })
  settings.getState().openDialog('data-account')
  function mount() {
    const cells: any[] = [], effects: Array<() => void> = [], cleanups: Array<(() => void) | undefined> = []
    let cursor = 0
    const hooks = {
      useState(initial: unknown) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], (v: any) => { cells[i] = typeof v === 'function' ? v(cells[i]) : v }] },
      useRef(initial: unknown) { const i = cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i] },
      useEffect(fn: () => (() => void) | undefined, deps: unknown[]) {
        const i = cursor++
        if (!(i in cells) || deps.some((v, j) => !Object.is(v, cells[i][j]))) {
          cells[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() })
        }
      },
    }
    const component = load('./RemovedConversationsSettings.tsx', {
      react: hooks, 'react/jsx-runtime': { jsx: (type: unknown, props: any) => ({ type, props }), jsxs: (type: unknown, props: any) => ({ type, props }), Fragment: 'fragment' },
      '@/components/ui/button': { Button: 'button' }, '@/components/ResourceSkeleton': { ResourceSkeleton: 'loading' },
      '@/lib/actionToast': { notifyAction: (value: unknown) => notifications.push(value) },
      '@/lib/userFacingError': { userFacingError: () => 'error' },
      '@/features/conversations/api': { conversationsApi: api }, '@/features/conversations/store': conversations,
      './SettingsComponents': { SettingsGroup: 'group' }, './store': { useSettingsDialog: settings },
    }).RemovedConversationsSettings
    const render = () => { cursor = 0; const tree = component(); effects.splice(0).forEach(fn => { fn() }); return tree as Node }
    const nodes = () => { const result: Node[] = []; function visit(n: any) { if (!n) return; if (Array.isArray(n)) return n.forEach(visit); if (typeof n !== 'object') return; result.push(n); visit(n.props?.children) } visit(render()); return result }
    const buttons = () => nodes().filter(n => n.type === 'button' && n.props['aria-label'])
    render()
    return { render, rows: () => buttons().length, buttons,
      click: () => { const button = buttons()[0]; assert.ok(button); button.props.onClick() },
      unmount: () => cleanups.forEach(fn => { fn?.() }),
      settle: async () => { for (let i = 0; i < 4; i++) { await flush(); render() } },
    }
  }
  return { mount, settings, conversations, reads, rows, notifications,
    release: () => release(), releaseReload: () => releaseReload(),
    setFailure: (value: boolean) => { fail = value; held = false },
    holdReload: () => { holdReload = true },
    changeScope: () => { projectId = 'other'; conversations.useConversations.getState().reset() },
  }
}

test('closing immediately fences a restore before animation cleanup', async () => {
  const f = fixture(), view = f.mount(); await view.settle(); view.click()
  f.settings.getState().setOpen(false)
  f.release(); await view.settle()
  assert.equal(f.notifications.length, 0)
  view.unmount()
})

test('reopening before acceptance converges the new removed list', async () => {
  const f = fixture(), old = f.mount(); await old.settle(); old.click()
  f.settings.getState().setOpen(false); old.unmount()
  f.settings.getState().openDialog('data-account')
  const next = f.mount(); await next.settle(); assert.equal(next.rows(), 1)
  f.release(); await next.settle()
  assert.equal(f.rows.get('p')!.length, 0)
  assert.equal(next.rows(), 0)
  assert.equal(f.notifications.length, 0)
  next.unmount()
})

test('list invalidation does not strand the current restore pending state', async () => {
  const f = fixture(true), view = f.mount(); f.holdReload(); await view.settle(); view.click()
  f.release(); await view.settle()
  assert.equal(view.rows(), 1)
  assert.equal(view.buttons()[0].props.disabled, true)
  f.releaseReload(); await view.settle()
  assert.equal(view.buttons()[0].props.disabled, false)
  assert.equal(f.notifications.length, 1)
  view.unmount()
})

test('old-scope success cannot invalidate the current scope', async () => {
  const f = fixture(), old = f.mount(); await old.settle(); old.click()
  old.unmount(); f.changeScope()
  const next = f.mount(); await next.settle()
  const reads = f.reads.length
  f.release(); await next.settle()
  assert.equal(f.reads.length, reads)
  assert.equal(next.rows(), 1)
  assert.equal(f.notifications.length, 0)
  next.unmount()
})

test('failure preserves its row and permits a successful retry', async () => {
  const f = fixture(), view = f.mount(); f.setFailure(true); await view.settle(); view.click(); await view.settle()
  assert.equal(view.rows(), 1)
  assert.equal(view.buttons()[0].props.disabled, false)
  const reads = f.reads.length
  f.setFailure(false); view.click(); await view.settle()
  assert.equal(view.rows(), 0)
  assert.ok(f.reads.length > reads)
  assert.equal(f.notifications.length, 1)
  view.unmount()
})

test('rapid close/reopen fences old completion even while the old view awaits cleanup', async () => {
  const f = fixture(), old = f.mount(); await old.settle(); old.click()
  f.settings.getState().setOpen(false)
  f.settings.getState().openDialog('data-account')
  f.release(); await old.settle()
  assert.equal(f.notifications.length, 0)
  old.unmount()
})

test('data view generation leaves unrelated settings transitions unchanged', () => {
  const f = fixture(), initial = f.settings.getState().dataAccountEpoch
  f.settings.getState().setOpen(false)
  f.settings.getState().openDialog('data-account')
  assert.ok(f.settings.getState().dataAccountEpoch > initial)
  f.settings.getState().setActiveSection('account')
  const left = f.settings.getState().dataAccountEpoch
  f.settings.getState().setActiveSection('notifications')
  assert.equal(f.settings.getState().dataAccountEpoch, left)
})
