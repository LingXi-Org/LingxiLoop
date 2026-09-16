import { useEffect, useId, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { uploadsApi } from '@/features/platform/api'
import { toastAction } from '@/lib/actionToast'
import { generatedCourseAvatarUrl, generatedUserAvatarUrl } from '@/lib/generatedAvatar'
import { userFacingError } from '@/lib/userFacingError'

export type AvatarInput = { seed: string } | { key: string }
type AvatarDraft = { seed: string } | { file: File }
async function uploadAvatarDraft(draft: AvatarDraft): Promise<AvatarInput> {
  if ('seed' in draft) return draft
  const uploaded = await uploadsApi.uploadFile(draft.file)
  if (!uploaded.key) throw new Error('图片上传未返回文件标识，请重试。')
  return { key: uploaded.key }
}

export function AvatarEditor({ currentUrl, kind, onSave, disabled }: {
  currentUrl: string
  kind: 'user' | 'course'
  onSave(input: AvatarInput): Promise<void>
  disabled?: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AvatarDraft>()
  const [busy, setBusy] = useState(false)
  const [fileUrl, setFileUrl] = useState('')
  const [error, setError] = useState('')
  const file = draft && 'file' in draft ? draft.file : undefined
  useEffect(() => {
    if (!file) { setFileUrl(''); return }
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const src = draft && 'seed' in draft
    ? (kind === 'user' ? generatedUserAvatarUrl : generatedCourseAvatarUrl)(draft.seed)
    : fileUrl || currentUrl
  const title = kind === 'user' ? '修改个人头像' : '修改课程头像'
  const changeOpen = (next: boolean) => {
    if (busy) return
    setDraft(undefined)
    setError('')
    setOpen(next)
  }
  const save = async () => {
    if (!draft || busy || disabled) return
    setBusy(true)
    setError('')
    try {
      await toastAction((async () => onSave(await uploadAvatarDraft(draft)))(), {
        loading: '正在保存头像', success: '头像已保存', error: '保存头像失败，请稍后重试',
      })
      setOpen(false)
      setDraft(undefined)
    } catch (reason) {
      setError(userFacingError(reason, '保存头像失败，请稍后重试。'))
    } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="size-16 rounded-full p-0" aria-label={title} title={title} disabled={disabled}>
        <Avatar className="size-16"><AvatarImage src={currentUrl} alt="" /><AvatarFallback>头像</AvatarFallback></Avatar>
      </Button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>随机换一个，或上传自己的图片。保存后生效。</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-4">
        <Avatar className="size-20"><AvatarImage src={src} alt="头像预览" /><AvatarFallback>头像</AvatarFallback></Avatar>
        <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => { setError(''); setDraft({ seed: crypto.randomUUID() }) }}>随机换一个</Button>
      </div>
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-medium">上传图片</label>
        <Input id={id} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || disabled} aria-describedby={`${id}-hint`} onChange={(event) => {
          const selected = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!selected) return
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size === 0 || selected.size > 5 * 1024 * 1024) {
            setError('请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。'); return
          }
          setError(''); setDraft({ file: selected })
        }} />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">PNG、JPEG、WebP，最大 5 MB。</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => changeOpen(false)}>取消</Button>
        <Button type="button" disabled={!draft || busy || disabled} onClick={() => void save()}>保存头像</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
