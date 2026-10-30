import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, FileIcon, ImagePlusIcon, LinkIcon, PaperclipIcon, PlusIcon, UploadIcon, XIcon } from 'lucide-react'
import { type RefObject, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ForumAttachment } from './contracts'
import { attachmentKind, forumFileUrl, ForumFileOpen } from './ForumAttachments'

// Presentation only: uploads, Markdown insertion and draft persistence stay with the host.
export function ForumMaterials({ attachments, links, setLinks, disabled, picker, onMove, onRemove, onInsertImage, open, setOpen }: {
  attachments: ForumAttachment[]; links: string; setLinks(value: string): void; disabled: boolean
  picker: RefObject<HTMLInputElement | null>; onMove(index: number, direction: number): void
  onRemove(file: ForumAttachment): void; onInsertImage(file: ForumAttachment): void
  open: boolean; setOpen(value: boolean): void
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), linkInput = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState('')
  const references = links.split('\n').map(link => link.trim()).filter(Boolean)
  const count = attachments.length + references.length
  const closeLink = () => { setLinkOpen(false); setError(''); trigger.current?.focus() }
  const addLink = () => {
    if (disabled) return
    let value: URL
    try {
      value = new URL(url.trim())
      if (!['http:', 'https:'].includes(value.protocol)) throw new Error('scheme')
    } catch { setError('请输入以 http:// 或 https:// 开头的有效链接。'); return }
    if (references.length >= 20) { setError('最多附加 20 个参考链接。'); return }
    if (value.href.length > 2048) { setError('链接地址不能超过 2,048 个字符。'); return }
    setLinks([...references, value.href].join('\n')); setUrl(''); setOpen(true); closeLink()
  }
  return <>
    <div data-forum-material-bar className="forum-materials-bar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button ref={trigger} type="button" variant="outline" size="sm" disabled={disabled}><PlusIcon />添加材料<ChevronDownIcon /></Button></DropdownMenuTrigger>
        <DropdownMenuContent className="forum-focus-theme forum-focus-popover" align="start" side="top" onCloseAutoFocus={event => {
          if (linkOpen) { event.preventDefault(); linkInput.current?.focus() }
        }}>
          <DropdownMenuItem disabled={disabled || attachments.length >= 20} onSelect={() => picker.current?.click()}><UploadIcon />上传文件或图片</DropdownMenuItem>
          <DropdownMenuItem disabled={disabled || references.length >= 20} onSelect={() => { setLinkOpen(true); setError('') }}><LinkIcon />附加参考链接</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={`${id}-tray`} onClick={() => setOpen(!open)}><PaperclipIcon />材料 {count}<ChevronDownIcon className={open ? 'rotate-180' : undefined} /></Button>
      <span className="forum-materials-summary">{count ? `${attachments.length} 个文件 · ${references.length} 个链接` : '还没有附加材料'}</span>
    </div>
    <section id={`${id}-tray`} hidden={!open} data-forum-materials aria-label="材料托盘" className="forum-materials-tray">
      {count === 0 ? <p className="text-xs text-muted-foreground">还没有材料，可添加文件或参考链接。</p> : <ul className="forum-materials-list">
        {attachments.map((file, index) => <li key={file.key} className="forum-material">
          {attachmentKind(file.name) === 'image' ? <img src={forumFileUrl(file)} alt="" className="forum-material-kind object-cover" /> : <span className="forum-material-kind"><FileIcon /></span>}
          <ForumFileOpen file={file} className="forum-material-name">{file.name}<span className="forum-material-meta">{attachmentKind(file.name) === 'image' ? '图片' : '文件'}</span></ForumFileOpen>
          <div className="forum-material-actions">
            {attachmentKind(file.name) === 'image' && <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`插入正文：${file.name}`} title="在光标处插入图片" onClick={() => onInsertImage(file)}><ImagePlusIcon /></Button>}
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === 0} aria-label={`上移附件：${file.name}`} onClick={() => onMove(index, -1)}><ArrowUpIcon /></Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || index === attachments.length - 1} aria-label={`下移附件：${file.name}`} onClick={() => onMove(index, 1)}><ArrowDownIcon /></Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`移除附件：${file.name}`} onClick={() => onRemove(file)}><XIcon /></Button>
          </div>
        </li>)}
        {references.map((link, index) => <li key={`${index}:${link}`} className="forum-material">
          <span className="forum-material-kind"><LinkIcon /></span>
          <a href={/^https?:\/\//i.test(link) ? link : undefined} target="_blank" rel="noopener noreferrer" className="forum-material-name">{link}<span className="forum-material-meta">参考链接</span></a>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`移除参考链接：${link}`} onClick={() => setLinks(references.filter((_, position) => position !== index).join('\n'))}><XIcon /></Button>
        </li>)}
      </ul>}
    </section>
    {linkOpen && <div role="group" aria-label="附加参考链接" className="forum-material-link" onKeyDown={event => {
      if (event.key === 'Enter' && event.target === linkInput.current && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); addLink() }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLink() }
    }}>
      <Label htmlFor={`${id}-link`}>链接地址</Label>
      <Input ref={linkInput} id={`${id}-link`} type="url" value={url} disabled={disabled} onChange={event => setUrl(event.target.value)} placeholder="https://" maxLength={2048} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-link-error` : undefined} />
      {error && <p id={`${id}-link-error`} role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={closeLink}>取消</Button><Button type="button" size="sm" disabled={disabled || !url.trim()} onClick={addLink}>添加到材料</Button></div>
    </div>}
  </>
}
