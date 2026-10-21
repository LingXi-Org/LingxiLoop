import { create } from 'zustand'

// Component fixture only: no server or user data. Production settings and UI are real.
export const useAuth = create(() => ({ user: { id: 'fixture-user' }, activeCompanyId: 'fixture-company', clear() {} }))
export const useWorkspace = create(() => ({ selectedId: 'fixture-project' }))
const row = { id: 'removed-a', title: '已移除的测试对话' }
export const fixture = {
  mode: 'rows', restoreFails: false, restores: [] as string[], aborted: 0,
  restoreHeld: false, release: () => {}, releaseRestore: () => {},
}
export const conversationsApi = {
  async getRemovedConversations(signal: AbortSignal) {
    signal.addEventListener('abort', () => { fixture.aborted++ }, { once: true })
    if (fixture.mode === 'hold') await new Promise<void>(resolve => { fixture.release = resolve })
    if (fixture.mode === 'error') throw new Error('服务暂时不可用')
    return fixture.mode === 'empty' ? [] : [row]
  },
}
export function captureConversationScope() {
  const project = useWorkspace.getState().selectedId
  return () => useWorkspace.getState().selectedId === project
}
export const useConversations = create<{ removedListRevision: number; restore: (id: string) => Promise<boolean> }>(set => ({ removedListRevision: 0, restore: async (id: string) => {
  fixture.restores.push(id)
  if (fixture.restoreHeld) await new Promise<void>(resolve => { fixture.releaseRestore = resolve })
  if (fixture.restoreFails) throw new Error('恢复失败，请稍后重试。')
  fixture.mode = 'empty'
  set(state => ({ removedListRevision: state.removedListRevision + 1 }))
  return true
} }))
export const authApi = { signOut: async () => {} }
export const AccountSettingsPanel = () => <p>账号资料</p>
export const AppearanceSoundSettingsPanel = () => null
export const NotificationSettingsPanel = () => null
