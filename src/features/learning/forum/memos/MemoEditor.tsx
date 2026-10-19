// Memos decorated Markdown editor hosted by course forms; see README.md for source mapping.
import { EyeIcon, LinkIcon, PencilIcon } from 'lucide-react'
import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Editor from './editor/Editor'
import type { EditorFileOrigin } from './editor/Editor/extensions'
import { FormattingToolbar } from './editor/Toolbar/FormattingToolbar'
import type { EditorController } from './editor/types/editorController'
import { MemoContent } from './MemoContent'

export const MemoEditor = forwardRef<EditorController, {
  value: string; onChange(value: string): void; label: string; disabled?: boolean; maxLength?: number; tags?: string[]
  onFiles?(files: File[], origin: EditorFileOrigin): void
  compact?: boolean; focusCanvas?: boolean; onFocus?(): void
}>(({ value, onChange, label, disabled = false, maxLength = 20000, tags, onFiles, compact = false, focusCanvas = false, onFocus }, ref) => {
  const controller = useRef<EditorController>(null), root = useRef<HTMLFieldSetElement>(null)
  const linkId = useId()
  const [preview, setPreview] = useState(false), [linkOpen, setLinkOpen] = useState(false), [url, setUrl] = useState('')
  useImperativeHandle(ref, () => controller.current!, [])
  const toolbar = <>
    <div hidden={compact} data-forum-formatting={focusCanvas || undefined} className={focusCanvas ? "forum-focus-toolbar" : "flex flex-wrap items-center gap-1 border-b border-border p-2"}>
      <div className="min-w-0 flex-1" hidden={preview}><FormattingToolbar controllerRef={controller} portalClassName={focusCanvas ? "forum-focus-theme forum-focus-popover" : undefined} /></div>
      {!preview && <Popover open={linkOpen} onOpenChange={setLinkOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={focusCanvas ? "插入正文超链接" : "插入链接"}><LinkIcon /></Button></PopoverTrigger>
        <PopoverContent className={focusCanvas ? "forum-focus-theme forum-focus-popover space-y-3" : "space-y-3"} onCloseAutoFocus={event => { event.preventDefault(); controller.current?.focus() }}>
          <Label htmlFor={linkId}>链接地址</Label><Input id={linkId} type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" />
          <Button type="button" disabled={!/^https?:\/\//i.test(url)} onClick={() => { controller.current?.formatting?.run('link', { url }); setLinkOpen(false); setUrl('') }}>插入链接</Button>
        </PopoverContent></Popover>}
      <Tooltip><TooltipTrigger asChild><Button type="button" variant={preview ? 'secondary' : 'ghost'} size="sm" className="ms-auto" aria-label={preview ? '继续编辑' : '预览正文'} aria-pressed={preview} onClick={() => setPreview(value => !value)}>
        {preview ? <PencilIcon /> : <EyeIcon />}{preview ? '编辑' : '预览'}
      </Button></TooltipTrigger><TooltipContent>{preview ? '返回 Markdown 编辑器' : '预览排版、公式和图表'}</TooltipContent></Tooltip>
    </div>
  </>
  return <fieldset ref={root} disabled={disabled} onFocusCapture={()=>{if(compact)setPreview(false);onFocus?.()}} className={focusCanvas ? "forum-focus-editor" : "min-w-0 rounded-xl border border-input bg-background transition-shadow motion-reduce:transition-none focus-within:ring-2 focus-within:ring-ring/40"}>
    <legend className="sr-only">{label}</legend>

    {!focusCanvas && toolbar}
    <div className={focusCanvas ? 'forum-focus-writing' : compact?'min-w-0 px-3 py-2':'min-w-0 p-3'} hidden={preview && !compact}>
      <Editor ref={controller} className={compact?'memo-editor-content memo-editor-compact':'memo-editor-content min-h-20'} label={label} initialContent={value} onContentChange={onChange}
        placeholder="写下你的想法，支持 Markdown…" disabled={disabled || (preview && !compact)} maxLength={maxLength} tags={tags}
        onFiles={(files, origin) => onFiles?.(files, origin)} onSubmit={() => { if (!disabled) root.current?.closest('form')?.requestSubmit() }} />
    </div>
    {preview && !compact && <div data-memo-editor-preview className={focusCanvas ? "forum-focus-preview" : "max-h-72 min-h-20 min-w-0 overflow-auto p-3"}>{value.trim() ? <MemoContent content={value} /> : <p className="text-sm text-muted-foreground">还没有可预览的内容。</p>}</div>}
    <div hidden={compact} className={focusCanvas ? "forum-focus-writing-meta" : "flex flex-wrap justify-between gap-2 px-3 pb-2 text-xs text-muted-foreground"}><span>Ctrl / ⌘ + Enter 提交 · Esc 离开编辑器</span><span>{value.length.toLocaleString()} / {maxLength.toLocaleString()}</span></div>
    {focusCanvas && toolbar}
  </fieldset>
})
MemoEditor.displayName = 'MemoEditor'
