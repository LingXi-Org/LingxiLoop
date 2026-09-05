import { File01Icon, Loading03Icon, Upload04Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { notifyAction, toastAction } from '@/lib/actionToast'

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json'
const MAX_BYTES = 200 * 1024 * 1024

export function KnowledgeSourceUploadDialog({
  open,
  onOpenChange,
  onFiles,
  onUrl,
  onText,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFiles: (files: File[]) => void
  onUrl: (url: string, title?: string) => Promise<void>
  onText: (title: string, text: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'file' | 'url' | 'text'>('file')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setTab('file')
    setTitle('')
    setUrl('')
    setText('')
    setDragging(false)
  }

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && busy) return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await toastAction(action(), { loading: '正在添加资料', success: '资料已提交处理', error: '资料添加失败' })
      setBusy(false)
      reset()
      onOpenChange(false)
    } catch { setBusy(false) }
  }

  const upload = (files: File[]) => {
    const allowed = files.filter((file) => file.size <= MAX_BYTES)
    if (allowed.length !== files.length) notifyAction({ title: '部分文件超过 200 MB，已跳过', type: 'warning' })
    if (allowed.length === 0) return
    reset()
    onOpenChange(false)
    void onFiles(allowed)
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="h-[min(32rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>添加资料</DialogTitle>
        <DialogDescription>PDF、DOCX、TXT、MD、CSV、JSON，单文件不超过 200 MB</DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="min-h-0">
        <TabsList className="w-full"><TabsTrigger value="file">文件</TabsTrigger><TabsTrigger value="url">网页 URL</TabsTrigger><TabsTrigger value="text">粘贴文本</TabsTrigger></TabsList>
        <TabsContent value="file" className="min-h-0 overflow-hidden">
          <Empty
            className={dragging ? 'h-full border border-dashed border-ring bg-accent/50' : 'h-full border border-dashed'}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); upload([...event.dataTransfer.files]) }}
          >
            <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>拖放多个文件到这里</EmptyTitle><EmptyDescription>文件会立即上传并进入处理队列</EmptyDescription></EmptyHeader>
            <EmptyContent><Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />浏览文件</Button><Input ref={fileRef} hidden multiple accept={ACCEPT} type="file" onChange={(event) => { upload([...event.target.files ?? []]); event.target.value = '' }} /></EmptyContent>
          </Empty>
        </TabsContent>
        <TabsContent value="url" className="flex min-h-0 flex-col gap-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" />
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          <Button type="button" className="mt-auto self-end" disabled={busy || !url.trim()} onClick={() => void run(() => onUrl(url.trim(), title.trim() || undefined))}>{busy && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />}添加并处理</Button>
        </TabsContent>
        <TabsContent value="text" className="flex min-h-0 flex-col gap-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" />
          <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴需要作为依据的内容…" className="min-h-0 flex-1 resize-none" />
          <Button type="button" className="self-end" disabled={busy || !text.trim()} onClick={() => void run(() => onText(title.trim() || '粘贴文本', text.trim()))}>{busy && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />}添加并处理</Button>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
}
