import { Fragment, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Conversation } from '@/types'

export type PinnedMode = 'wide' | 'card' | 'compact' | 'tile' | 'row'

export function PinnedConversations({ conversations, renderConversation }: {
  conversations: Conversation[]
  renderConversation(conversation: Conversation, mode: PinnedMode): ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (conversations.length === 0) return null
  const mode: PinnedMode = conversations.length > 4 ? 'tile' : conversations.length > 2 ? 'compact' : conversations.length === 2 ? 'card' : 'wide'
  const overflow = conversations.length > 8
  const visible = overflow ? conversations.slice(0, 7) : conversations
  return <>
    {mode === 'tile' && <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">
      <span>置顶 · {conversations.length}</span>
      <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)}>全部</Button>
    </div>}
    <div data-pinned-grid={mode} className={`grid gap-1.5 pb-1 ps-0.5 pt-1.5 ${mode === 'tile' ? 'grid-cols-4' : mode === 'wide' ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {visible.map(conversation => <div key={conversation.id} className="min-w-0">{renderConversation(conversation, mode)}</div>)}
      {overflow && <button type="button" aria-label="查看全部置顶会话" onClick={() => setOpen(true)} className="flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl shadow-[inset_0_0_0_1px_var(--input)] hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring">
        <span className="text-sm font-semibold">+{conversations.length - visible.length}</span><span className="text-[11px] text-muted-foreground">全部</span>
      </button>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[80dvh] w-[420px] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto rounded-2xl border-0 p-0 shadow-[0_0_0_1px_var(--border),0_24px_60px_-12px_rgb(20_20_18/25%)]">
        <div className="flex items-start gap-2 px-[18px] pb-3 pt-[18px]">
          <DialogHeader className="flex-1 gap-0.5 text-start">
            <DialogTitle className="text-base font-semibold">置顶对话</DialogTitle>
            <DialogDescription className="text-[12.5px]">{conversations.length} 个</DialogDescription>
          </DialogHeader>
          <DialogClose aria-label="关闭" className="grid size-[30px] place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </DialogClose>
        </div>
        <div className="grid grid-cols-2 gap-2 px-[18px] pb-[18px] [&>[data-overflow]]:opacity-55" onClick={event => {
          if ((event.target as HTMLElement).closest('[data-pinned-conversation]')) setOpen(false)
        }}>
          {conversations.map((conversation, index) => <Fragment key={conversation.id}>
            {index === visible.length && overflow && <div aria-hidden className="col-span-full my-1 border-t-[1.5px] border-dashed border-input" />}
            <div className="min-w-0" data-overflow={overflow && index >= visible.length ? '' : undefined}>{renderConversation(conversation, 'row')}</div>
          </Fragment>)}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
