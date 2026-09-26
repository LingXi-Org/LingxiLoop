import { useEffect, useId, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { uploadsApi } from '@/features/platform/api'
import { useWorkspace } from '@/features/knowledge/workspace'
import { userFacingError } from '@/lib/userFacingError'
import type { Participant } from '@/types'
import { agentsApi } from '../api'
import { useParticipants } from '../state'

export function AgentAvatarEditor({ agent }: { agent: Participant }) {
  const inputId = useId()
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Participant['personalAvatar']>(agent.personalAvatar)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const changeOpen = (value: boolean) => {
    if (busy) return
    setDraft(agent.personalAvatar); setFile(null); setError(''); setOpen(value)
  }
  const save = async () => {
    if (busy) return
    setBusy(true); setError('')
    const workspaceId = useWorkspace.getState().selectedId
    try {
      let input: { seed: string } | { key: string } | null = draft && 'seed' in draft ? draft : null
      if (file) {
        const uploaded = await uploadsApi.uploadFile(file)
        if (!uploaded.key) throw new Error('图片上传未返回文件标识，请重试。')
        input = { key: uploaded.key }
      } else if (draft && 'url' in draft) { setOpen(false); return }
      if (!alive.current || useWorkspace.getState().selectedId !== workspaceId) return
      const result = await agentsApi.saveAvatar(agent.id, input)
      if (!alive.current || useWorkspace.getState().selectedId !== workspaceId) return
      useParticipants.getState().setAvatar(agent.id, result.avatar)
      setOpen(false)
    } catch (reason) { setError(userFacingError(reason, '头像保存失败，请重试。')) }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><button type="button" aria-label={`更换${agent.name}的头像`} className="shrink-0 rounded-xl p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"><Avatar p={agent} size={72} /></button></DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>更换 {agent.name} 的头像</DialogTitle><DialogDescription>自定义头像仅你可见。</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar p={{ ...agent, personalAvatar: file && preview ? { url: preview } : draft }} size={80} animated={false} />
        <Button variant="outline" disabled={busy} onClick={() => { setFile(null); setDraft({ seed: crypto.randomUUID() }); setError('') }}>随机换一个</Button>
        <Button variant="ghost" disabled={busy} onClick={() => { setFile(null); setDraft(null); setError('') }}>恢复默认</Button>
      </div>
      <div className="space-y-2">
        <label htmlFor={inputId} className="text-sm font-medium">上传图片</label>
        <Input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} aria-describedby={`${inputId}-hint`} onChange={event => {
          const selected = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!selected) return
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size === 0 || selected.size > 5 * 1024 * 1024) {
            setError('请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。'); return
          }
          setError(''); setFile(selected)
        }} />
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">PNG、JPEG、WebP，最大 5 MB。</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => changeOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void save()}>{busy ? '正在保存…' : '保存头像'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
