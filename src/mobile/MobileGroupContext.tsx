import { GroupCanvasPanel } from '@/components/GroupContextContent'
import { SourcePanel } from '@/components/WorkspaceChrome'
import { useApp } from '@/stores/app'

export function MobileGroupContext({ conversationId }: { conversationId: string }) {
  const tab = useApp((state) => state.mobileGroupContext ?? 'knowledge')
  const open = useApp((state) => state.openMobileGroupContext)
  const close = useApp((state) => state.closeMobileGroupContext)
  return <section className="flex h-full min-h-0 flex-col bg-panel">
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-3">
      <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full text-xl text-ink-secondary active:bg-raised" aria-label="关闭群聊上下文">‹</button>
      <div className="min-w-0 flex-1"><h1 className="text-sm font-semibold text-ink">群聊上下文</h1><p className="text-[10px] text-ink-secondary">知识库与实时 Canvas</p></div>
    </header>
    <nav className="mx-3 mt-3 grid h-10 shrink-0 grid-cols-2 rounded-xl bg-raised p-1" aria-label="群聊上下文分区">
      <button type="button" onClick={() => open('knowledge')} className={`rounded-lg text-xs font-semibold ${tab === 'knowledge' ? 'bg-panel text-accent shadow-sm' : 'text-ink-secondary'}`}>知识库</button>
      <button type="button" onClick={() => open('canvas')} className={`rounded-lg text-xs font-semibold ${tab === 'canvas' ? 'bg-panel text-accent shadow-sm' : 'text-ink-secondary'}`}>Canvas</button>
    </nav>
    <div className="min-h-0 flex-1 pt-3">{tab === 'knowledge' ? <SourcePanel mobile /> : <GroupCanvasPanel conversationId={conversationId} />}</div>
  </section>
}
