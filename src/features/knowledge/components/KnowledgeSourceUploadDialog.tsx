import { File01Icon, Loading03Icon, Upload04Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Check, FileText, Globe, LockKeyhole, Trash2, Users } from 'lucide-react'
import type { KnowledgeSource } from '../contracts'
import { userFacingError } from '@/lib/userFacingError'
import { notifyAction, toastAction } from '@/lib/actionToast'

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json'
const MAX_BYTES = 200 * 1024 * 1024

export function KnowledgeSourceUploadDialog({
  open,
  onOpenChange,
  onFiles,
  onUrl,
  onText,
  visibilityScope = 'PRIVATE',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFiles: (files: File[]) => Promise<void>
  onUrl: (url: string, title?: string) => Promise<void>
  visibilityScope?: KnowledgeSource['visibilityScope']
  onText: (title: string, text: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'file' | 'url' | 'text'>('file')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setError('')
    setFiles([])
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
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await toastAction(action(), { loading: '正在添加资料', success: '资料已添加，正在准备内容', error: '资料添加失败' })
      setBusy(false)
      reset()
      onOpenChange(false)
    } catch (reason) { setError(userFacingError(reason, '部分资料未能上传，请重试。已成功的文件不会重复上传。')); setBusy(false) }
  }

  const selectFiles = (incoming: File[]) => {
    const allowed = incoming.filter(file => file.size <= MAX_BYTES && /\.(pdf|docx|txt|md|csv|json)$/i.test(file.name))
    if (allowed.length !== incoming.length) notifyAction({ title: '已跳过不支持的文件或超过 200 MB 的文件', type: 'warning' })
    setFiles(previous => [...previous, ...allowed.filter(file => !previous.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified))])
    setDragging(false)
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="h-[min(32rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-xl">上传资料</DialogTitle>
        <DialogDescription className="sr-only">添加文件、网页或文本</DialogDescription>
        <p className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{visibilityScope === 'PROJECT' ? <Users className="size-4" /> : <LockKeyhole className="size-4" />}{visibilityScope === 'PROJECT' ? '课程成员可见' : '仅自己可见'}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogHeader>
      <Tabs value={tab} onValueChange={(value) => { if (!busy) setTab(value as typeof tab) }} className="min-h-0">
        <TabsList className="w-full"><TabsTrigger disabled={busy} value="file"><FileText className="size-4" />文件</TabsTrigger><TabsTrigger disabled={busy} value="url"><Globe className="size-4" />网页链接</TabsTrigger><TabsTrigger disabled={busy} value="text">粘贴文本</TabsTrigger></TabsList>
        <TabsContent value="file" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Empty
            className={dragging ? 'min-h-44 flex-1 border border-dashed border-ring bg-accent/50' : 'min-h-44 flex-1 border border-dashed bg-muted/10'}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); if (!busy) selectFiles([...event.dataTransfer.files]) }}
          >
            <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>拖放文件</EmptyTitle><EmptyDescription>PDF、DOCX、TXT、MD、CSV、JSON · 单文件不超过 200 MB</EmptyDescription></EmptyHeader>
            <EmptyContent><Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><HugeiconsIcon icon={Upload04Icon} strokeWidth={2} />浏览文件</Button><Input ref={fileRef} aria-label="选择资料文件" disabled={busy} hidden multiple accept={ACCEPT} type="file" onChange={(event) => { selectFiles([...event.target.files ?? []]); event.target.value = '' }} /></EmptyContent>
          </Empty>
          {files.length > 0 && <ul aria-label="待上传文件" className="max-h-36 shrink-0 overflow-y-auto divide-y rounded-lg border">{files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 px-3 py-2 text-sm"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={`移除文件：${file.name}`} onClick={() => setFiles(current => current.filter((_, at) => at !== index))}><Trash2 className="size-4" /></Button></li>)}</ul>}
          <Button type="button" disabled={busy || files.length === 0} className="shrink-0 self-end" onClick={() => void run(() => onFiles(files))}>{busy ? <HugeiconsIcon icon={Loading03Icon} className="animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}{busy ? '正在上传…' : `上传${files.length ? ` ${files.length} 个文件` : '文件'}`}</Button>
        </TabsContent>
        <TabsContent value="url" className="flex min-h-0 flex-col gap-3">
          <Input aria-label="资料标题" disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" />
          <Input aria-label="网页地址" type="url" disabled={busy} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          <Button type="button" className="mt-auto self-end" disabled={busy || !url.trim()} onClick={() => void run(() => onUrl(url.trim(), title.trim() || undefined))}>{busy && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />}添加并处理</Button>
        </TabsContent>
        <TabsContent value="text" className="flex min-h-0 flex-col gap-3">
          <Input aria-label="资料标题" disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" />
          <Textarea aria-label="文本内容" disabled={busy} value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴文本…" className="min-h-0 flex-1 resize-none" />
          <Button type="button" className="self-end" disabled={busy || !text.trim()} onClick={() => void run(() => onText(title.trim() || '粘贴文本', text.trim()))}>{busy && <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />}添加并处理</Button>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
}
