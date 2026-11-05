import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Conversation } from '@/types'

export type PinnedMode = 'wide' | 'card' | 'compact' | 'tile'

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
      {overflow && <Button type="button" variant="outline" aria-label="查看全部置顶会话" onClick={() => setOpen(true)} className="h-full min-h-16 min-w-0 flex-col gap-1 rounded-[10px] border-dashed px-1">
        <span>+{conversations.length - visible.length}</span><span className="text-xs font-normal text-muted-foreground">更多</span>
      </Button>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>置顶会话</DialogTitle><DialogDescription>选择会话继续交流。</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-2" onClick={event => {
          if ((event.target as HTMLElement).closest('[data-pinned-conversation]')) setOpen(false)
        }}>
          {conversations.map(conversation => <div key={conversation.id} className="min-w-0">{renderConversation(conversation, 'compact')}</div>)}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
