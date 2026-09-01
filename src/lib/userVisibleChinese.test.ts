import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('notification and email affordances keep fixed user-visible copy in Chinese', () => {
  const notificationToasts = read('../components/NotificationToasts.tsx')
  const notificationWindow = read('../components/NotificationWindow.tsx')
  const sonner = read('../components/ui/sonner.tsx')
  const emailComposer = read('../features/email/components/EmailComposer.tsx')
  const messageConverter = read('../features/chat/runtime/converter.ts')

  assert.doesNotMatch(notificationToasts, /\|\| '\(empty\)'|body:\s*`[^`]*@-mentioned you|title=\{`[^`]*more message/)
  assert.match(notificationToasts, /在“\$\{e\.documentTitle\}”中提到了你/)
  assert.doesNotMatch(notificationWindow, /\(empty\)|unread in this conversation/)
  assert.match(notificationWindow, /条未读消息/)
  assert.match(sonner, /customAriaLabel="通知"/)
  assert.match(sonner, /closeButtonAriaLabel: "关闭通知"/)
  assert.doesNotMatch(emailComposer, /aria-label=\{`Remove /)
  assert.match(emailComposer, /aria-label=\{`移除 /)
  assert.doesNotMatch(messageConverter, /'\(empty\)'/)
  assert.match(messageConverter, /'（无内容）'/)
})

test('calendar and message timestamps use the explicit Chinese locale', () => {
  const calendar = read('../features/calendar/components/CalendarView.tsx')
  const eventPeek = read('../features/calendar/components/CalendarEventPeekContent.tsx')
  const artifactPeek = read('../components/ArtifactPeekPrimitives.tsx')
  const conversationMessage = read('../features/chat/components/ConversationMessage.tsx')

  assert.doesNotMatch(calendar, /one-shot|every \$\{|toLocaleDateString\(undefined/)
  assert.match(calendar, /if \(!r\) return '仅一次'/)
  assert.doesNotMatch(eventPeek, /toLocaleDateString\(undefined/)
  assert.doesNotMatch(artifactPeek, /toLocaleDateString\(undefined/)
  assert.match(conversationMessage, /toLocaleTimeString\('zh-CN'/)
})

test('protocol and service errors are mapped at user-visible boundaries', () => {
  const eventEditor = read('../features/calendar/components/EventEditor.tsx')
  const knowledge = read('../components/WorkspaceChrome.tsx')
  const tool = read('../components/prompt-kit/tool.tsx')
  const conversationThread = read('../features/chat/components/ConversationThread.tsx')

  assert.doesNotMatch(eventEditor, /run-now: \$\{r\.status\}/)
  assert.match(eventEditor, /userFacingError\(r\.error, '任务执行失败，请稍后重试。'\)/)
  assert.match(knowledge, /userFacingError\(selectedSource\.error, '资料处理失败，请重试。'\)/)
  assert.doesNotMatch(knowledge, /\?\? source\.stage/)
  assert.match(tool, /userFacingError\(toolPart\.errorText, "工具执行失败，请稍后重试。"\)/)
  assert.match(conversationThread, /userFacingError\(snapshot\.error, '消息加载失败，请稍后重试。'\)/)
})

test('browser entry points keep their fixed product copy in Chinese', () => {
  const index = read('../../index.html')
  const localIdentity = read('../../scripts/local-identity-mock.mjs')

  assert.match(index, /<title>LingxiLoop — 人与智能助教协作<\/title>/)
  assert.doesNotMatch(index, /Human-Agent collaboration/)
  assert.match(localIdentity, /<button type="submit">继续进入 LingxiLoop<\/button>/)
  assert.doesNotMatch(localIdentity, /Continue to LingxiLoop|Only this loopback process receives/)
})

test('invitation success actions use natural Chinese around the product name', () => {
  const invitation = read('../features/companies/components/InviteAcceptScreen.tsx')
  const invitationManager = read('../features/companies/components/InvitePeopleModal.tsx')
  const avatar = read('../components/BloubAvatar.tsx')

  assert.match(invitation, />进入工作区</)
  assert.match(invitation, /继续使用 LingxiLoop/)
  assert.doesNotMatch(invitation, /桌面端打开|下载桌面/)
  assert.doesNotMatch(invitation, /在LingxiLoop|继续LingxiLoop|从您上次停下/)
  assert.match(invitationManager, /INVITATION_STATUS_LABELS/)
  assert.match(invitationManager, /invitationRoleLabel\(invitation\.role\)/)
  assert.doesNotMatch(invitationManager, /navigator\.clipboard\.writeText\(inviteId\)/)
  assert.match(avatar, /AVATAR_STATUS_LABELS\[status\] \?\? '状态更新中'/)
})

test('participant labels and missing resources never expose raw enums or internal ids', () => {
  const participantRole = read('./participantRole.ts')
  const mentionList = read('../components/MentionList.tsx')
  const members = read('../components/MembersPopover.tsx')
  const email = read('../features/email/components/EmailComposer.tsx')
  const calendarPeek = read('../features/calendar/components/CalendarEventPeekContent.tsx')
  const documentLink = read('../features/documents/components/DocumentLink.tsx')
  const calendarLink = read('../features/calendar/components/CalendarLink.tsx')
  const mentionExtension = read('./mentionExtension.tsx')
  const canvasHeader = read('../features/canvas/components/CanvasHeader.tsx')
  const canvasView = read('../features/canvas/components/CanvasView.tsx')
  const tool = read('../components/prompt-kit/tool.tsx')
  const notificationToasts = read('../components/NotificationToasts.tsx')

  assert.match(participantRole, /participant\.kind === 'human'\) return '成员'/)
  assert.match(participantRole, /ROLE_ZH\[normalized\] \?\? '智能助教'/)
  for (const source of [mentionList, members, email, calendarPeek]) {
    assert.match(source, /participantRoleZh/)
  }
  assert.doesNotMatch(email, /p\.email \?\? p\.id/)
  assert.doesNotMatch(documentLink, /doc\?\.title\?\.trim\(\) \|\| id/)
  assert.doesNotMatch(calendarLink, /event\?\.title\?\.trim\(\) \|\| id/)
  assert.doesNotMatch(mentionExtension, /node\.attrs\.label \?\? node\.attrs\.id/)
  assert.doesNotMatch(canvasHeader, /assignment\.agentId\.slice/)
  assert.doesNotMatch(canvasView, /agent\?\.name \?\? item\.agentId/)
  assert.doesNotMatch(canvasView, /owner\?\.name \?\? ownerId/)
  assert.doesNotMatch(tool, />\{toolCallId\}</)
  assert.doesNotMatch(notificationToasts, /author\?\.name \?\? toast\.authorId/)
})
