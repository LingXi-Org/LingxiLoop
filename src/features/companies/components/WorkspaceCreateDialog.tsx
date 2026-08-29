import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toastAction } from '@/lib/actionToast'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { companiesApi } from '../api'

export function WorkspaceCreateDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const addCompany = useAuth((state) => state.addCompany)

  useEffect(() => {
    if (!open) setName('')
  }, [open])

  const submit = async () => {
    const value = name.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const company = await toastAction(companiesApi.createCompany(value), {
        loading: '正在创建工作区', success: '工作区已创建', error: '创建工作区失败',
      })
      useApp.getState().selectConversation(null)
      useApp.getState().setView('conversations')
      addCompany(company)
      onOpenChange(false)
    } catch {
      // The global Toast already presents the authoritative server error.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建工作区</DialogTitle>
          <DialogDescription>首发版会建立唯一的通用工作区和原生学习团队。</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-4">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="工作区名称"
            aria-label="工作区名称"
            disabled={busy}
          />
          <DialogFooter>
            <button type="button" className="rounded-lg px-4 py-2 text-sm hover:bg-muted" onClick={() => onOpenChange(false)} disabled={busy}>取消</button>
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!name.trim() || busy}>
              {busy ? '创建中…' : '创建'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
