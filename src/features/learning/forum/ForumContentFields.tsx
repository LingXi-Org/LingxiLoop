import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { uploadsApi } from '@/features/platform/api'
import { userFacingError } from '@/lib/userFacingError'
import type { ForumAttachment } from './contracts'

export function ForumContentFields({ body, setBody, links, setLinks, attachments, setAttachments, disabled, onUploading, label = '内容正文' }: {
  body: string; setBody(value: string): void; links: string; setLinks(value: string): void
  attachments: ForumAttachment[]; setAttachments(value: ForumAttachment[]): void
  disabled: boolean; onUploading(value: boolean): void; label?: string
}) {
  const id = useId(), [error, setError] = useState('')
  return <div className="space-y-3">
    <div className="space-y-2"><Label htmlFor={`${id}-body`}>{label}</Label><Textarea id={`${id}-body`} value={body} onChange={event => setBody(event.target.value)} maxLength={20000} rows={5} disabled={disabled} /></div>
    <div className="space-y-2"><Label htmlFor={`${id}-links`}>链接（每行一个）</Label><Textarea id={`${id}-links`} value={links} onChange={event => setLinks(event.target.value)} rows={2} disabled={disabled} placeholder="https://" /></div>
    <div className="space-y-2"><Label htmlFor={`${id}-files`}>附件</Label><Input id={`${id}-files`} type="file" multiple disabled={disabled || attachments.length >= 20} onChange={async event => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (!files.length) return
      setError('')
      if (attachments.length + files.length > 20) { setError('最多上传 20 个附件。'); return }
      onUploading(true)
      try {
        const added: ForumAttachment[] = []
        for (const file of files) {
          const uploaded = await uploadsApi.uploadFile(file)
          if (!uploaded.key) throw new Error('attachment storage key missing')
          added.push({ key: uploaded.key, name: uploaded.name })
        }
        setAttachments([...attachments,...added])
      } catch (reason) { setError(userFacingError(reason, '附件上传失败，请重试。')) }
      finally { onUploading(false) }
    }} /></div>
    {attachments.length > 0 && <ul className="space-y-1">{attachments.map(file => <li key={file.key} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words">{file.name}</span><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setAttachments(attachments.filter(item => item.key !== file.key))} aria-label={`移除附件：${file.name}`}>移除</Button></li>)}</ul>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export function ForumFiles({ links, attachments }: { links: string[]; attachments: ForumAttachment[] }) {
  if (!links.length && !attachments.length) return null
  return <ul className="w-full space-y-1 text-sm">{links.map(link => <li key={link}><a className="break-all text-primary underline underline-offset-4 focus-visible:outline-2" href={link} target="_blank" rel="noopener noreferrer">{link}</a></li>)}
    {attachments.map(file => <li key={file.key}><a className="break-words text-primary underline underline-offset-4 focus-visible:outline-2" href={`/api/files?key=${encodeURIComponent(file.key)}`} target="_blank" rel="noopener noreferrer">{file.name}</a></li>)}
  </ul>
}

export const contentLinks = (value: string) => value.split('\n').map(link => link.trim()).filter(Boolean)
