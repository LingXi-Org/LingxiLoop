import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CardSurface } from '@/components/assistant-ui/elements/surfaces'
import type { Message, TeacherBriefingPayload } from '@/types'

function briefing(message: Message): TeacherBriefingPayload {
  if (!message.teacherBriefing) throw new Error('Teacher Briefing part is missing its native payload')
  return message.teacherBriefing
}

export function BriefingMessagePart({ message }: { message: Message }) {
  const value = briefing(message)
  return <CardSurface className="mt-2 w-full max-w-[620px] gap-3 p-4" data-teacher-message="briefing">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-semibold">教学简报</p><p className="mt-1 text-sm text-muted-foreground">{message.body}</p></div>
      <Badge variant="secondary">#{value.windowStartSequence + 1}–#{value.windowEndSequence}</Badge>
    </div>
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">{value.statistics.eventCount ?? 0} 项更新</Badge>
      <Badge variant={value.attentionItemIds.length ? 'destructive' : 'outline'}>{value.attentionItemIds.length} 项关注</Badge>
    </div>
  </CardSurface>
}

export function AttentionCardsPart({ message }: { message: Message }) {
  const value = briefing(message)
  const [open, setOpen] = useState(false)
  if (!value.attentionItemIds.length) return null
  return <Collapsible open={open} onOpenChange={setOpen} className="mt-2 w-full max-w-[620px]" data-teacher-message="attention">
    <CardSurface variant="interactive" interactive className="gap-0 p-0">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-auto w-full justify-between rounded-2xl px-4 py-3">
          <span className="text-sm font-medium">需要关注</span><span className="text-xs text-muted-foreground">{open ? '收起' : `展开 ${value.attentionItemIds.length} 项`}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-2 border-t px-4 py-3">
          {value.attentionItemIds.map((id, index) => <li key={id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-sm">
            <span>关注事项 {index + 1}</span><Badge variant="outline" title={id}>待处理</Badge>
          </li>)}
        </ul>
      </CollapsibleContent>
    </CardSurface>
  </Collapsible>
}

export function EvidenceSheetPart({ message }: { message: Message }) {
  const value = briefing(message)
  const statistics = Object.entries(value.statistics).filter(([key]) => key !== 'eventCount' && key !== 'attentionCount')
  return <Sheet>
    <SheetTrigger asChild><Button type="button" variant="link" size="sm" className="mt-1 px-0" data-teacher-message="evidence">查看简报依据</Button></SheetTrigger>
    <SheetContent className="sm:max-w-md">
      <SheetHeader><SheetTitle>简报依据</SheetTitle><SheetDescription>只展示本次访问窗口内的确定性事件统计与关联 Attention。</SheetDescription></SheetHeader>
      <Tabs defaultValue="window" className="px-6">
        <TabsList><TabsTrigger value="window">事件窗口</TabsTrigger><TabsTrigger value="attention">Attention</TabsTrigger></TabsList>
        <TabsContent value="window" className="space-y-3 py-4">
          <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">起始 sequence</dt><dd>{value.windowStartSequence}</dd></div><div><dt className="text-muted-foreground">截止 sequence</dt><dd>{value.windowEndSequence}</dd></div></dl>
          <ul className="space-y-2">{statistics.map(([name, count]) => <li key={name} className="flex justify-between rounded-xl bg-muted/50 px-3 py-2"><span>{name}</span><span>{count}</span></li>)}</ul>
        </TabsContent>
        <TabsContent value="attention" className="py-4">
          {value.attentionItemIds.length ? <ul className="space-y-2">{value.attentionItemIds.map((id) => <li key={id} className="break-all rounded-xl bg-muted/50 px-3 py-2 font-mono text-xs">{id}</li>)}</ul> : <p className="text-sm text-muted-foreground">本窗口没有需要关注的事项。</p>}
        </TabsContent>
      </Tabs>
    </SheetContent>
  </Sheet>
}
