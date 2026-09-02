import { Copy01Icon, Delete02Icon, UserAdd01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { notifyAction, toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { ApiCourseMember, ApiProjectInvitation, LearningSpace } from '../contracts'

export function CourseMembersSection({ space }: { space: LearningSpace }) {
  const canView = space.perspective === 'teacher' && space.canManage && Boolean(space.courseId)
  const canInvite = canView && space.canInviteMembers
  const canRevoke = canView && space.canRevokeInvitations
  const canRemove = canView && space.canRemoveMembers
  const canUpdate = canView && space.canUpdateMembers
  const canWrite = canInvite || canRevoke || canRemove || canUpdate
  const [members, setMembers] = useState<ApiCourseMember[]>([])
  const [invitations, setInvitations] = useState<ApiProjectInvitation[]>([])
  const [createdLink, setCreatedLink] = useState('')
  const [loading, setLoading] = useState(canView)
  const [busy, setBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!canView || !space.courseId) return
    setLoading(true)
    setError('')
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        learningApi.listCourseMembers(space.courseId),
        learningApi.listProjectInvitations(space.projectId),
      ])
      setMembers(nextMembers)
      setInvitations(nextInvitations)
    } catch (reason) {
      setError(userFacingError(reason, '课程成员与邀请暂时无法加载，请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [canView, space.courseId, space.projectId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!canInvite) setInviteOpen(false)
  }, [canInvite])

  if (!canView) {
    return <Alert><AlertDescription>你可以查看课程学习内容，但没有管理成员与分享邀请的权限。</AlertDescription></Alert>
  }

  const createInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canInvite) return
    const form = event.currentTarget
    const data = new FormData(form)
    const email = String(data.get('email') ?? '').trim()
    const confirmed = await confirmSensitiveAction({
      title: '创建课程邀请？',
      description: email ? `邀请链接将仅供 ${email} 使用。` : '任何获得此链接的人都可以按邀请限制加入课程。',
      confirmLabel: '创建邀请',
      tone: 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const invitation = await toastAction(learningApi.createProjectInvitation(space.projectId, {
        email: email || null,
        note: String(data.get('note') ?? '').trim() || null,
        expiresInDays: Number(data.get('expiresInDays') ?? 7),
        maxUses: Number(data.get('maxUses') ?? 1),
      }), {
        loading: '正在创建课程邀请',
        success: '课程邀请已创建',
        error: '创建课程邀请失败，请稍后重试',
      })
      setCreatedLink(invitation.url)
      setInviteOpen(false)
      form.reset()
      await load()
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  const removeMember = async (member: ApiCourseMember) => {
    if (!space.courseId || busy || !canRemove) return
    const confirmed = await confirmSensitiveAction({
      title: '移除课程成员？',
      description: `${member.name} 将失去这门课程及课程对话的访问权限。`,
      confirmLabel: '移除成员',
      tone: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await toastAction(learningApi.removeCourseMember(space.courseId, member.id), {
        loading: '正在移除课程成员', success: '课程成员已移除', error: '移除课程成员失败，请稍后重试',
        description: member.name,
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  const updateMemberRole = async (member: ApiCourseMember, role: ApiCourseMember['role']) => {
    if (!space.courseId || busy || !canUpdate || role === member.role) return
    const roleLabel = role === 'teacher' ? '课程管理者' : '学习者'
    const confirmed = await confirmSensitiveAction({
      title: '变更课程角色？',
      description: `${member.name} 将变更为${roleLabel}。`,
      confirmLabel: '变更角色',
      tone: 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await toastAction(learningApi.updateCourseMember(space.courseId, member.id, role), {
        loading: '正在变更课程角色',
        success: '课程角色已变更',
        error: '变更课程角色失败，请稍后重试',
        description: member.name,
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  const revokeInvite = async (invitation: ApiProjectInvitation) => {
    if (busy || !canRevoke) return
    const confirmed = await confirmSensitiveAction({
      title: '撤销课程邀请？',
      description: `${invitation.email ?? '公开邀请链接'} 将立即失效。`,
      confirmLabel: '撤销邀请',
      tone: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await toastAction(learningApi.revokeProjectInvitation(space.projectId, invitation.id), {
        loading: '正在撤销课程邀请', success: '课程邀请已撤销', error: '撤销课程邀请失败，请稍后重试',
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!canWrite && <Alert><AlertDescription>课程转移期间，成员和邀请信息可查看，暂时不能更改。</AlertDescription></Alert>}
      <Card>
        <CardHeader>
          <CardTitle>课程成员</CardTitle>
          <CardDescription>查看课程成员及其课程角色。</CardDescription>
          {canInvite && <div className="justify-self-end"><Button type="button" size="sm" onClick={() => setInviteOpen(true)}><HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} data-icon="inline-start" />创建邀请</Button></div>}
        </CardHeader>
        <CardContent>
          {loading ? <ResourceSkeleton variant="table" count={5} label="正在加载课程成员" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>成员</TableHead><TableHead>课程角色</TableHead><TableHead>加入时间</TableHead><TableHead><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
              <TableBody>{members.map((member) => <TableRow key={member.id}><TableCell><p className="font-medium">{member.name}</p><p className="text-xs text-muted-foreground">{member.email}</p></TableCell><TableCell>{canUpdate ? <Select value={member.role} disabled={busy} onValueChange={(role) => { if (role === 'teacher' || role === 'learner') void updateMemberRole(member, role) }}><SelectTrigger size="sm" className="min-w-32" aria-label={`变更 ${member.name} 的课程角色`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="teacher">课程管理者</SelectItem><SelectItem value="learner">学习者</SelectItem></SelectContent></Select> : <Badge variant="secondary">{member.role === 'teacher' ? '课程管理者' : '学习者'}</Badge>}</TableCell><TableCell>{new Date(member.joinedAt).toLocaleString('zh-CN')}</TableCell><TableCell>{canRemove && member.role === 'learner' && <Button type="button" variant="destructive" size="icon-sm" aria-label={`移除 ${member.name}`} disabled={busy} onClick={() => void removeMember(member)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} /></Button>}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
          {!loading && members.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">暂无课程成员。</p>}
        </CardContent>
      </Card>
      {createdLink && <Card size="sm"><CardContent className="flex flex-wrap items-center gap-3"><p className="min-w-0 flex-1 truncate text-sm">{createdLink}</p><Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(createdLink).then(() => notifyAction({ title: '邀请链接已复制' })).catch(() => notifyAction({ title: '复制失败，请手动复制链接', type: 'error' }))}><HugeiconsIcon icon={Copy01Icon} strokeWidth={2} data-icon="inline-start" />复制链接</Button></CardContent></Card>}
      <Card>
        <CardHeader><CardTitle>课程邀请</CardTitle><CardDescription>查看邀请状态、使用次数与到期时间。</CardDescription></CardHeader>
        <CardContent>
          {loading ? <ResourceSkeleton variant="table" count={3} label="正在加载课程邀请" /> : <Table><TableHeader><TableRow><TableHead>邀请对象</TableHead><TableHead>使用次数</TableHead><TableHead>最近接受</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableHead><span className="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody>{invitations.map((invitation) => {
            const latest = invitation.acceptances?.[0]
            return <TableRow key={invitation.id}><TableCell>{invitation.email ?? '公开链接'}</TableCell><TableCell>{invitation.useCount}/{invitation.maxUses}</TableCell><TableCell>{latest ? <><p>{latest.name ?? '一位学习者'}</p><p className="text-xs text-muted-foreground">{new Date(latest.acceptedAt).toLocaleString('zh-CN')}</p></> : '尚未使用'}</TableCell><TableCell>{new Date(invitation.expiresAt).toLocaleString('zh-CN')}</TableCell><TableCell><Badge variant="outline">{invitation.status === 'active' ? '有效' : invitation.status === 'revoked' ? '已撤销' : invitation.status === 'expired' ? '已过期' : '已用完'}</Badge></TableCell><TableCell>{canRevoke && invitation.status === 'active' && <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void revokeInvite(invitation)}>撤销</Button>}</TableCell></TableRow>
          })}</TableBody></Table>}
          {!loading && invitations.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">暂无课程邀请。</p>}
        </CardContent>
      </Card>
      <Dialog open={canInvite && inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>创建课程邀请</DialogTitle><DialogDescription>可限定邮箱、有效期与最多使用次数。提交前会再次确认。</DialogDescription></DialogHeader>
          <form id="course-invite-form" onSubmit={createInvite} className="space-y-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="course-invite-email">限定邮箱</FieldLabel><Input id="course-invite-email" name="email" type="email" placeholder="可选" /></Field>
              <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="course-invite-days">有效天数</FieldLabel><Input id="course-invite-days" name="expiresInDays" type="number" min="1" max="30" defaultValue="7" /></Field><Field><FieldLabel htmlFor="course-invite-uses">使用次数</FieldLabel><Input id="course-invite-uses" name="maxUses" type="number" min="1" max="100" defaultValue="1" /></Field></div>
              <Field><FieldLabel htmlFor="course-invite-note">备注</FieldLabel><Input id="course-invite-note" name="note" placeholder="可选" /></Field>
            </FieldGroup>
          </form>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>取消</Button><Button type="submit" form="course-invite-form" disabled={busy}>创建邀请</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
