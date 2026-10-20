import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, PaperclipIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { uploadsApi } from '@/features/platform/api'
import { useAuth } from '@/stores/auth'
import { userFacingError } from '@/lib/userFacingError'
import type { ForumAttachment } from './contracts'
import { attachmentKind, ForumAttachments, forumFileUrl } from './ForumAttachments'
import { ContentEditor, type ContentDocument, type ContentEditorHandle } from '@/features/content-editor'
import { ForumMaterials } from './ForumMaterials'


export function ForumContentFields({ body, editorDocument, legacyParagraphs, setBody, links, setLinks, attachments, setAttachments, disabled, onUploading, label = '内容正文', maxLength = 20000, compact = false, focusCanvas = false, nativeOnly = false, onFocus }: {
  body: string; editorDocument?: ContentDocument | null; setBody(value: string, document?: ContentDocument, sections?: string[]): void; links: string; setLinks(value: string): void
  legacyParagraphs?: string[]
  attachments: ForumAttachment[]; setAttachments(value: ForumAttachment[]): void
  disabled: boolean; onUploading(value: boolean): void; label?: string; maxLength?: number; tags?: string[]; compact?: boolean; focusCanvas?: boolean; nativeOnly?: boolean; onFocus?(): void
}) {
  const id = useId(), editor = useRef<ContentEditorHandle>(null), picker = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  const identity = useAuth(state => `${state.activeCompanyId}:${state.user?.id}`)
  const identityRef = useRef(identity); identityRef.current = identity
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [error, setError] = useState(''), [uploadName, setUploadName] = useState('')
  const [failed, setFailed] = useState<File[]>([]), uploading = useRef(false), latestFiles = useRef(attachments)
  latestFiles.current = attachments
  const upload = async (files: File[]): Promise<string[]> => {
    if (uploading.current || disabled || !files.length) return []
    if (latestFiles.current.length + files.length > 20) { setError('最多上传 20 个附件。'); return [] }
    uploading.current = true; setMaterialsOpen(true); onUploading(true); setError(''); setFailed([])
    const failures: File[] = [], urls: string[] = []
    const startedIdentity = identityRef.current
    const active = () => mounted.current && startedIdentity === identityRef.current
    try {
      for (const file of files) {
        setUploadName(file.name)
        try {
          const uploaded = await uploadsApi.uploadFile(file)
          if (!active()) throw new Error('内容已切换，请在当前内容中重新上传。')
          if (!uploaded.key) throw new Error('attachment storage key missing')
          const attachment = { key: uploaded.key, name: uploaded.name }
          latestFiles.current = [...latestFiles.current, attachment]
          setAttachments(latestFiles.current)
          urls.push(forumFileUrl(attachment))
        } catch (reason) {
          if (!active()) throw reason
          failures.push(file); setError(userFacingError(reason, '附件上传失败，请重试。已上传的附件已保留。'))
        }
      }
      setFailed(failures)
      return urls
    } finally { uploading.current = false; if (active()) { setUploadName(''); onUploading(false) } }
  }
  const move = (index: number, direction: number) => {
    const next = [...attachments], target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setAttachments(next)
  }
  return <div className={compact || focusCanvas ? 'min-w-0' : 'min-w-0 space-y-2'}>
    <ContentEditor ref={editor} compact={compact} onFocus={onFocus} value={body} document={editorDocument} legacyParagraphs={legacyParagraphs} onChange={setBody} label={label} maxLength={maxLength} disabled={disabled} uploadFile={async file => {
      const [url] = await upload([file])
      if (!url) throw new Error('附件上传失败，请重试。')
      return url
    }} />
    <div hidden={compact || nativeOnly} className={focusCanvas ? undefined : "space-y-2"}>
      <Input ref={picker} id={`${id}-files`} aria-label="附件" className="sr-only" type="file" multiple disabled={disabled || attachments.length >= 20} onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files)
      }} />
    {focusCanvas ? <ForumMaterials attachments={attachments} links={links} setLinks={setLinks} disabled={disabled} picker={picker} open={materialsOpen} setOpen={setMaterialsOpen} onMove={move}
      onRemove={file => { setAttachments(attachments.filter(item => item.key !== file.key)); editor.current?.removeFile(forumFileUrl(file)) }}
      onInsertImage={file => editor.current?.insertImage(forumFileUrl(file), file.name)} /> : <>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled || attachments.length >= 20} onClick={() => picker.current?.click()}><PaperclipIcon />添加附件</Button>
      {uploadName ? <span role="status" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Spinner className="shrink-0 motion-reduce:animate-none" />正在上传 {uploadName}</span>
        : <span className="text-xs text-muted-foreground">可粘贴文件，或把图片拖入正文</span>}
    </div>
    {attachments.length > 0 && <ul className="space-y-1">{attachments.map((file, index) => <li key={file.key} className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-sm">
      {attachmentKind(file.name) === 'image' && <img src={forumFileUrl(file)} alt="" className="size-8 shrink-0 rounded object-cover" />}
      <a href={forumFileUrl(file)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words text-primary underline underline-offset-4">{file.name}</a>
      {attachmentKind(file.name) === 'image' && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`插入正文：${file.name}`} onClick={() => editor.current?.insertImage(forumFileUrl(file), file.name)}><ImagePlusIcon /></Button></TooltipTrigger><TooltipContent>在光标处插入图片</TooltipContent></Tooltip>}
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`上移附件：${file.name}`} onClick={() => move(index, -1)}><ArrowUpIcon /></Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === attachments.length - 1} aria-label={`下移附件：${file.name}`} onClick={() => move(index, 1)}><ArrowDownIcon /></Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setAttachments(attachments.filter(item => item.key !== file.key)); editor.current?.removeFile(forumFileUrl(file)) }} aria-label={`移除附件：${file.name}`}>移除</Button>
    </li>)}</ul>}
    <details className="rounded-lg border border-border/60 px-3 py-2"><summary className="cursor-pointer text-sm text-muted-foreground focus-visible:outline-2">附加链接</summary><div className="space-y-2 pt-2"><Label htmlFor={`${id}-links`}>链接（每行一个）</Label><Textarea id={`${id}-links`} value={links} onChange={event => setLinks(event.target.value)} rows={2} disabled={disabled} placeholder="https://" /></div></details>
    </>}
    {focusCanvas && uploadName && <p role="status" className="forum-focus-status flex items-center gap-2"><Spinner className="shrink-0 motion-reduce:animate-none" />正在上传 {uploadName}</p>}
    {error && <p role="alert" className={focusCanvas ? "forum-focus-status text-destructive" : "text-sm text-destructive"}>{error}{failed.length > 0 && <Button type="button" variant="link" disabled={disabled} onClick={() => void upload(failed)}>重试上传</Button>}</p>}
    </div>
    {nativeOnly && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export function ForumFiles({ links, attachments }: { links: string[]; attachments: ForumAttachment[] }) {
  return <div className="w-full min-w-0 space-y-2">{links.length > 0 && <ul className="space-y-1 text-sm">{links.map(link => <li key={link}><a className="break-all text-primary underline underline-offset-4 focus-visible:outline-2" href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>)}</ul>}
    {attachments.length > 0 && <ForumAttachments attachments={attachments} />}
  </div>
}

export const contentLinks = (value: string) => value.split('\n').map(link => link.trim()).filter(Boolean)
