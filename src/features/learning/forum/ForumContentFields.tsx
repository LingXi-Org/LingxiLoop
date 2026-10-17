import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, PaperclipIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { uploadsApi } from '@/features/platform/api'
import { userFacingError } from '@/lib/userFacingError'
import type { ForumAttachment } from './contracts'
import { attachmentKind, ForumAttachments, forumFileUrl } from './ForumAttachments'
import type { EditorFileOrigin } from './memos/editor/Editor/extensions'
import type { EditorController } from './memos/editor/types/editorController'
import { MemoEditor } from './memos/MemoEditor'

const imageMarkdown = (file: ForumAttachment) => `![${file.name.replace(/[\\[\]]/g, '\\$&')}](${forumFileUrl(file)})`

export function ForumContentFields({ body, setBody, links, setLinks, attachments, setAttachments, disabled, onUploading, label = '内容正文', maxLength = 20000, tags, compact = false, onFocus }: {
  body: string; setBody(value: string): void; links: string; setLinks(value: string): void
  attachments: ForumAttachment[]; setAttachments(value: ForumAttachment[]): void
  disabled: boolean; onUploading(value: boolean): void; label?: string; maxLength?: number; tags?: string[]; compact?: boolean; onFocus?(): void
}) {
  const id = useId(), editor = useRef<EditorController>(null), picker = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(''), [uploadName, setUploadName] = useState('')
  const [failed, setFailed] = useState<File[]>([]), uploading = useRef(false), latestFiles = useRef(attachments)
  latestFiles.current = attachments
  const upload = async (files: File[], origin?: EditorFileOrigin) => {
    if (uploading.current || disabled || !files.length) return
    if (latestFiles.current.length + files.length > 20) { setError('最多上传 20 个附件。'); return }
    uploading.current = true; onUploading(true); setError(''); setFailed([])
    const failures: File[] = []
    try {
      for (const file of files) {
        const anchor = origin?.source === 'drop' && file.type.startsWith('image/') ? crypto.randomUUID() : null
        const descriptor = anchor ? { id: anchor, status: 'uploading' as const, completed: 0, total: 1, message: `正在上传 ${file.name}`, retryLabel: '重试', keepLabel: '取消插入' } : null
        if (descriptor) editor.current?.createUploadAnchor(descriptor, origin?.source === 'drop' ? origin.position : undefined)
        setUploadName(file.name)
        try {
          const uploaded = await uploadsApi.uploadFile(file)
          if (!uploaded.key) throw new Error('attachment storage key missing')
          const attachment = { key: uploaded.key, name: uploaded.name }
          latestFiles.current = [...latestFiles.current, attachment]
          setAttachments(latestFiles.current)
          if (anchor) editor.current?.resolveUploadAnchor(anchor, imageMarkdown(attachment))
        } catch (reason) {
          if (anchor) editor.current?.cancelUploadAnchor(anchor)
          failures.push(file); setError(userFacingError(reason, '附件上传失败，请重试。已上传的附件已保留。'))
        }
      }
      setFailed(failures)
    } finally { uploading.current = false; setUploadName(''); onUploading(false) }
  }
  const move = (index: number, direction: number) => {
    const next = [...attachments], target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setAttachments(next)
  }
  return <div className={compact?'min-w-0':'min-w-0 space-y-2'}>
    <MemoEditor ref={editor} compact={compact} onFocus={onFocus} value={body} onChange={setBody} label={label} maxLength={maxLength} tags={tags} disabled={disabled} onFiles={(files, origin) => void upload(files, origin)} />
    <div hidden={compact} className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Input ref={picker} id={`${id}-files`} aria-label="附件" className="sr-only" type="file" multiple disabled={disabled || attachments.length >= 20} onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files)
      }} />
      <Button type="button" variant="outline" size="sm" disabled={disabled || attachments.length >= 20} onClick={() => picker.current?.click()}><PaperclipIcon />添加附件</Button>
      {uploadName ? <span role="status" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Spinner className="shrink-0 motion-reduce:animate-none" />正在上传 {uploadName}</span>
        : <span className="text-xs text-muted-foreground">可粘贴文件，或把图片拖入正文</span>}
    </div>
    {attachments.length > 0 && <ul className="space-y-1">{attachments.map((file, index) => <li key={file.key} className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-sm">
      {attachmentKind(file.name) === 'image' && <img src={forumFileUrl(file)} alt="" className="size-8 shrink-0 rounded object-cover" />}
      <a href={forumFileUrl(file)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words text-primary underline underline-offset-4">{file.name}</a>
      {attachmentKind(file.name) === 'image' && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`插入正文：${file.name}`} onClick={() => editor.current?.insertMarkdown(imageMarkdown(file))}><ImagePlusIcon /></Button></TooltipTrigger><TooltipContent>在光标处插入图片</TooltipContent></Tooltip>}
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`上移附件：${file.name}`} onClick={() => move(index, -1)}><ArrowUpIcon /></Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === attachments.length - 1} aria-label={`下移附件：${file.name}`} onClick={() => move(index, 1)}><ArrowDownIcon /></Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setAttachments(attachments.filter(item => item.key !== file.key)); setBody(body.replaceAll(imageMarkdown(file), '')) }} aria-label={`移除附件：${file.name}`}>移除</Button>
    </li>)}</ul>}
    <details className="rounded-lg border border-border/60 px-3 py-2"><summary className="cursor-pointer text-sm text-muted-foreground focus-visible:outline-2">附加链接</summary><div className="space-y-2 pt-2"><Label htmlFor={`${id}-links`}>链接（每行一个）</Label><Textarea id={`${id}-links`} value={links} onChange={event => setLinks(event.target.value)} rows={2} disabled={disabled} placeholder="https://" /></div></details>
    {error && <p role="alert" className="text-sm text-destructive">{error}{failed.length > 0 && <Button type="button" variant="link" disabled={disabled} onClick={() => void upload(failed)}>重试上传</Button>}</p>}
    </div>
  </div>
}

export function ForumFiles({ links, attachments }: { links: string[]; attachments: ForumAttachment[] }) {
  return <div className="w-full min-w-0 space-y-2">{links.length > 0 && <ul className="space-y-1 text-sm">{links.map(link => <li key={link}><a className="break-all text-primary underline underline-offset-4 focus-visible:outline-2" href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>)}</ul>}
    {attachments.length > 0 && <ForumAttachments attachments={attachments} />}
  </div>
}

export const contentLinks = (value: string) => value.split('\n').map(link => link.trim()).filter(Boolean)
