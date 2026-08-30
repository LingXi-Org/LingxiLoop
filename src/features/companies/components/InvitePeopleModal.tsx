import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { companiesApi } from '@/features/companies/api'
import type { ApiInvitation, ApiInvitationWithToken } from '@/features/companies/contracts'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useAuth } from '@/stores/auth'

interface Props {
  companyId: string
  companyName: string
  onClose: () => void
}

type InviteMode = 'link' | 'email'

export function InvitePeopleModal({ companyId, companyName, onClose }: Props) {
  const [mode, setMode] = useState<InviteMode>('link')
  const [list, setList] = useState<ApiInvitation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listErr, setListErr] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [created, setCreated] = useState<ApiInvitationWithToken | null>(null)
  const emailCapable = useAuth((state) => state.serverCapabilities?.invitationEmail === true)

  const reload = useCallback(async () => {
    setLoadingList(true)
    setListErr(null)
    try {
      setList(await companiesApi.listInvitations(companyId))
    } catch (error) {
      setListErr(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingList(false)
    }
  }, [companyId])

  useEffect(() => { void reload() }, [reload])

  const submit = async () => {
    setFormErr(null)
    setCreated(null)
    const trimmedEmail = email.trim()
    if (mode === 'email' && !trimmedEmail) {
      setFormErr('请输入电子邮件地址。')
      return
    }
    if (mode === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormErr('请输入有效的电子邮件地址。')
      return
    }
    setBusy(true)
    try {
      const payload = mode === 'email'
        ? { email: trimmedEmail, role, note: note.trim() || null, sendEmail: emailCapable && sendEmail }
        : { multiUse: true, role, note: note.trim() || null }
      const invitation = await toastAction(companiesApi.createInvitation(companyId, payload), {
        loading: '正在创建邀请',
        success: mode === 'email' ? '电子邮件邀请已创建' : '邀请链接已创建',
        error: '创建邀请失败',
      })
      setCreated(invitation)
      setEmail('')
      setNote('')
      void reload()
    } catch (error) {
      setFormErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    if (!await confirmSensitiveAction({
      title: '撤销邀请？',
      description: '撤销后，此邀请链接将立即失效且无法再被兑换。',
      confirmLabel: '撤销邀请',
      tone: 'destructive',
    })) return
    try {
      await toastAction(companiesApi.revokeInvitation(companyId, id), {
        loading: '正在撤销邀请', success: '邀请已撤销', error: '撤销邀请失败',
      })
      void reload()
    } catch (error) {
      setListErr(error instanceof Error ? error.message : String(error))
    }
  }

  const activeInvitations = useMemo(() => list.filter((invitation) => invitation.status === 'active'), [list])
  const historicalInvitations = useMemo(() => list.filter((invitation) => invitation.status !== 'active'), [list])

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[88vh] max-w-[600px] gap-0 overflow-hidden bg-card p-0" showCloseButton={!busy}>
        <DialogHeader className="border-b border-[var(--im-divider-weak)] px-6 py-5 pe-14">
          <DialogTitle>邀请参加 {companyName}</DialogTitle>
          <DialogDescription>通过可分享链接或电子邮件将人员添加到此工作区。</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <Tabs value={mode} onValueChange={(value) => {
            setMode(value as InviteMode)
            setCreated(null)
            setFormErr(null)
          }}>
            <TabsList>
              <TabsTrigger value="link">邀请链接</TabsTrigger>
              <TabsTrigger value="email">通过电子邮件</TabsTrigger>
            </TabsList>
          </Tabs>

          <FieldGroup>
            {mode === 'email' ? (
              <Field>
                <FieldLabel htmlFor="invite-email">电子邮件</FieldLabel>
                <FieldDescription>一次性使用并锁定到该地址，对方需使用相同地址登录。</FieldDescription>
                <Input id="invite-email" type="email" autoFocus autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" />
              </Field>
            ) : (
              <Alert><AlertDescription>知道链接的任何人都可以加入。链接将在 7 天后过期，并可随时撤销。</AlertDescription></Alert>
            )}

            {mode === 'email' && emailCapable && (
              <Field orientation="horizontal">
                <Checkbox id="send-invite-email" checked={sendEmail} onCheckedChange={(checked) => setSendEmail(checked === true)} />
                <div>
                  <FieldLabel htmlFor="send-invite-email">通过电子邮件发送邀请</FieldLabel>
                  <FieldDescription>取消选择后，你可以自行复制和分享邀请链接。</FieldDescription>
                </div>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>角色</FieldLabel>
                <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">成员</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-note">备注（可选）</FieldLabel>
                <Input id="invite-note" maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} placeholder="这个邀请用于什么？" />
              </Field>
            </div>
          </FieldGroup>

          {formErr && <Alert variant="destructive"><AlertDescription>{formErr}</AlertDescription></Alert>}
          {created && <CreatedInviteCard invite={created} onDone={() => setCreated(null)} />}
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? '正在创建…' : mode === 'email' ? '创建电子邮件邀请' : '创建邀请链接'}
          </Button>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">待处理的邀请</h3>
              <Badge variant="secondary">{activeInvitations.length}</Badge>
            </div>
            {loadingList && <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
            {!loadingList && activeInvitations.length === 0 && (
              <Empty className="border"><EmptyHeader><EmptyTitle>没有待处理的邀请</EmptyTitle><EmptyDescription>创建的新邀请会显示在这里。</EmptyDescription></EmptyHeader></Empty>
            )}
            <ItemGroup>
              {activeInvitations.map((invitation) => (
                <InvitationRow key={invitation.id} invitation={invitation} onRevoke={() => void revoke(invitation.id)} />
              ))}
            </ItemGroup>
            {historicalInvitations.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">显示 {historicalInvitations.length} 条历史邀请</summary>
                <ItemGroup className="mt-2 opacity-70">
                  {historicalInvitations.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} historical />)}
                </ItemGroup>
              </details>
            )}
            {listErr && <Alert variant="destructive"><AlertDescription>{listErr}</AlertDescription></Alert>}
          </section>
        </div>

        <DialogFooter className="border-t border-[var(--im-divider-weak)] bg-card px-6 py-4">
          <span className="me-auto text-xs text-muted-foreground">邀请将在 7 天后过期。</span>
          <Button variant="outline" onClick={onClose} disabled={busy}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatedInviteCard({ invite, onDone }: { invite: ApiInvitationWithToken; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* Clipboard availability is surfaced by the unchanged button state. */ }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{invite.emailDelivery?.ok ? '邀请已发送' : '邀请已可分享'}</CardTitle>
        <CardDescription>{invite.email ? `该邀请仅限 ${invite.email} 使用。` : `知道链接的任何人都可以作为 ${invite.role} 加入。`}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Input readOnly value={invite.url} className="font-mono" onFocus={(event) => event.currentTarget.select()} />
        <Button variant="secondary" onClick={copy}>{copied ? '已复制' : '复制'}</Button>
        <Button variant="ghost" onClick={onDone}>关闭</Button>
      </CardContent>
    </Card>
  )
}

function InvitationRow({ invitation, onRevoke, historical }: { invitation: ApiInvitation; onRevoke?: () => void; historical?: boolean }) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{invitation.email ?? '可分享链接'} <Badge variant={invitation.status === 'active' ? 'secondary' : 'outline'}>{invitation.status}</Badge> <Badge variant="outline">{invitation.role}</Badge></ItemTitle>
        <ItemDescription>
          {!invitation.email && `${invitation.useCount}/${invitation.maxUses} 已使用 · `}
          {invitation.status === 'active' ? `${relativeFrom(invitation.expiresAt)}后过期` : invitation.note ?? '历史邀请'}
        </ItemDescription>
      </ItemContent>
      {invitation.status === 'active' && !historical && onRevoke && (
        <ItemActions>
          <CopyLinkButton inviteId={invitation.id} />
          <Button variant="destructive" size="sm" onClick={onRevoke}>撤销</Button>
        </ItemActions>
      )}
    </Item>
  )
}

function CopyLinkButton({ inviteId }: { inviteId: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /* Clipboard availability is surfaced by the unchanged button state. */ }
  }
  return <Button variant="outline" size="sm" onClick={copy} title="复制邀请参考">{copied ? '已复制' : '复制参考'}</Button>
}

function relativeFrom(iso: string): string {
  const milliseconds = new Date(iso).getTime() - Date.now()
  const absolute = Math.abs(milliseconds)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (absolute < hour) return `${Math.max(1, Math.round(absolute / minute))} 分钟`
  if (absolute < day) return `${Math.round(absolute / hour)} 小时`
  if (absolute < 7 * day) return `${Math.round(absolute / day)} 天`
  return `${Math.round(absolute / (7 * day))} 周`
}
