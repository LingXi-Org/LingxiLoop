import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createLingxiAssistantMessage, type LingxiImMessageCustom } from '@/im/assistantMessage'
import type { Message, MessageKind, Participant } from '@/types'

async function readImStyles(): Promise<string> {
  const files = await Promise.all([
    readFile(new URL('../styles/globals.css', import.meta.url), 'utf8'),
    readFile(new URL('../styles/chat.css', import.meta.url), 'utf8'),
  ])
  return files.join('\n')
}

test('native shadcn configuration and dashboard primitives retain preset b3bZWXGcRE tokens', async () => {
  const config = JSON.parse(await readFile(new URL('../../components.json', import.meta.url), 'utf8')) as {
    style: string
    iconLibrary: string
    menuColor: string
    menuAccent: string
    tailwind: { baseColor: string; cssVariables: boolean }
  }
  assert.deepEqual(config, {
    ...config,
    style: 'base-luma',
    iconLibrary: 'hugeicons',
    menuColor: 'default',
    menuAccent: 'subtle',
    tailwind: { ...config.tailwind, baseColor: 'mist', cssVariables: true },
  })

  const nativeSources = await Promise.all(
    ['avatar', 'button', 'card', 'drawer', 'empty', 'field', 'input-group', 'label', 'resizable', 'sidebar', 'tabs', 'tooltip'].map((name) => (
      readFile(new URL(`../components/ui/${name}.tsx`, import.meta.url), 'utf8')
    )),
  )
  assert.doesNotMatch(nativeSources.join('\n'), /(?:bg|text|border|ring)-(?:white|black|gray|slate|zinc|stone|red|blue|green)-|#[0-9a-f]{3,8}/i)
})

test('text, poll, artifact, handoff, and approval receive native IM presentation metadata', () => {
  const participant: Participant = { id: 'agent', kind: 'agent', name: 'Agent', initial: 'A', avatarBg: '#000', status: 'avail' }
  for (const kind of ['text', 'poll', 'tool', 'handoff', 'approval'] as const) {
    const raw: Message = { id: kind, conversationId: 'room', authorId: participant.id, kind: kind as MessageKind, body: '', at: '10:00', createdAt: '2026-01-01T10:00:00.000Z' }
    const converted = createLingxiAssistantMessage(raw, 0, [raw], { [participant.id]: participant }, 'me')
    const shell = converted.metadata?.custom as unknown as LingxiImMessageCustom
    assert.equal(shell.presentation.variant, 'standard', `${kind} must stay in LingxiImMessage`)
    assert.equal(shell.presentation.quote, true)
    assert.equal(shell.presentation.reactions, true)
    assert.equal(shell.presentation.reply, true)
    assert.equal(shell.presentation.selection, true)
  }
  const presentationFor = (kind: MessageKind) => {
    const raw: Message = { id: kind, conversationId: 'room', authorId: participant.id, kind, body: '', at: '10:00', createdAt: '2026-01-01T10:00:00.000Z' }
    const converted = createLingxiAssistantMessage(raw, 0, [raw], { [participant.id]: participant }, 'me')
    assert.ok(converted.metadata?.custom)
    return (converted.metadata.custom as unknown as LingxiImMessageCustom).presentation
  }
  assert.equal(presentationFor('handoff').linkPreview, false)
  assert.equal(presentationFor('approval').linkPreview, false)
  assert.equal(presentationFor('approval').attachmentHost, true)
})

test('desktop renders the native assistant-ui IM entry', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /<LingxiImMessage\b/)
  assert.match(desktop, /useAuiState\(\(state\) => state\.message\.metadata\.custom\)/)
})

test('the desktop Web/Electron surface composes the shared IM core without Telegram runtime code', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const composer = await readFile(new URL('../features/chat/components/ChatComposer.tsx', import.meta.url), 'utf8')
  const desktopProfile = await readFile(new URL('../desktop/InfoPane.tsx', import.meta.url), 'utf8')
  const desktopList = await readFile(new URL('../features/conversations/components/ConversationsPane.tsx', import.meta.url), 'utf8')
  const desktopShell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const packageJson = await readFile(new URL('../../package.json', import.meta.url), 'utf8')

  for (const component of ['MessageList', 'ConversationHeader']) {
    assert.match(desktop, new RegExp(`<${component}\\b`))
  }
  assert.match(composer, /<ComposerSurface\b/)
  assert.match(composer, /<ComposerPrimitive\.Root\b/)
  assert.match(composer, /<ComposerPrimitive\.Input\b/)
  assert.match(composer, /<ComposerPrimitive\.AddAttachment\b/)
  assert.match(composer, /<ComposerPrimitive\.Send\b/)
  assert.match(composer, /<Tooltip\b/)
  assert.match(composer, /@hugeicons\/core-free-icons/)
  assert.doesNotMatch(composer, /@tabler\/icons-react|IClip|ISend|ISmile/)
  assert.match(desktopProfile, /<ParticipantProfile\b/)
  assert.match(desktopList, /<ConversationListItemContent\b/)
  assert.match(desktopShell, /<PersonalDashboard[\s\S]*?view=\{view\}/)
  assert.match(desktopShell, /<Drawer open=\{drawerOpen\}/)
  assert.match(desktopShell, /direction="right"/)
  assert.match(desktopShell, /selectedConversation\?\.kind === 'group'/)
  assert.doesNotMatch(desktopShell, /id="detail"|DESKTOP_THREE_PANEL_LAYOUT_KEY|data-group-context=/)
  assert.doesNotMatch(desktopShell, /DesktopNavigation/)
  assert.doesNotMatch(packageJson, /"(?:teact|telegram-tt)"/i)
})

test('desktop chat reserves a scrollable middle row so the composer stays at the bottom', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /chat-surface grid h-full min-h-0 min-w-0 grid-rows-/)
  assert.match(desktop, /grid-rows-\[auto_auto_minmax\(0,1fr\)_auto_auto\]/)
  assert.match(desktop, /data-chat-auxiliary="true"[\s\S]*?<ConversationActivity/)
  assert.doesNotMatch(desktop, /searchOpen[\s\S]{0,160}grid-rows-/)
  assert.match(desktop, /<Composer convoId=\{convoId\} \/>/)
})

test('desktop IM columns resize without changing the message/composer grid contract', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const resizable = await readFile(new URL('../components/ui/resizable.tsx', import.meta.url), 'utf8')
  const css = await readImStyles()
  assert.match(shell, /<ResizablePanelGroup/)
  assert.match(shell, /<ResizableHandle[\s\S]*?withHandle/)
  assert.match(shell, /minSize=\{LEFT_COLUMN_MIN\}/)
  assert.match(shell, /minSize=\{MIDDLE_COLUMN_MIN\}/)
  assert.match(shell, /defaultLayout=/)
  assert.match(resizable, /ResizablePrimitive\.Separator/)
  assert.match(resizable, /data-slot="resizable-handle"/)
  assert.match(css, /\.desktop-panel-resize-handle > div[\s\S]*?opacity: 0/)
  assert.doesNotMatch(shell, /setPointerCapture|requestAnimationFrame|pendingLeftWidthRef|--im-left-column-width/)
  const desktopLayoutCss = css.slice(css.indexOf('.desktop-im-grid'), css.indexOf('/* Grok-inspired transcript runs'))
  assert.doesNotMatch(desktopLayoutCss, /grid-template-columns|im-column-resizing|im-left-resize-handle/)
  assert.doesNotMatch(css, /group-context-splitter|--group-context-width/)
  assert.doesNotMatch(shell, /compactRailClosed|GroupContextRail/)
})

test('self messages align right and render the restored user identity', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  assert.match(message, /data-message-owner=\{isMine \? 'self' : 'other'\}/)
  assert.match(message, /align=\{isMine \? 'end' : 'start'\}/)
  assert.match(message, /groupStart && <span[^>]*>\{author\.name\}<\/span>/)
  assert.match(message, /\) : !isMine \? \(/)
  assert.match(message, /\) : \(\s*<MessageAvatar/)
  assert.doesNotMatch(message, /max-w-\[(?:70|84)%\]/)
})

test('desktop keeps one persisted two-panel IM layout and replaces it with the shadcn personal dashboard', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const dashboard = await readFile(new URL('../desktop/PersonalDashboard.tsx', import.meta.url), 'utf8')
  const resizable = await readFile(new URL('../components/ui/resizable.tsx', import.meta.url), 'utf8')
  const css = await readImStyles()
  assert.match(shell, /DESKTOP_TWO_PANEL_LAYOUT_KEY/)
  assert.doesNotMatch(shell, /DESKTOP_THREE_PANEL_LAYOUT_KEY/)
  assert.match(shell, /<ResizablePanelGroup/)
  assert.match(shell, /orientation="horizontal"/)
  assert.match(shell, /onLayoutChanged=/)
  assert.match(shell, /id="conversations"[\s\S]*?id="conversation"/)
  assert.doesNotMatch(shell, /id="detail"/)
  assert.match(shell, /dashboardOpen \? \([\s\S]*?<PersonalDashboard/)
  assert.doesNotMatch(shell, /<Tabs|<TabsList|<TabsTrigger/)
  assert.match(dashboard, /<SidebarProvider[\s\S]*?<Sidebar[\s\S]*?collapsible="none"[\s\S]*?<SidebarInset/)
  assert.match(dashboard, /'--sidebar-width': '100%'/)
  assert.match(dashboard, /<ResizablePanel id="conversations"[\s\S]*?minSize=\{280\}[\s\S]*?maxSize=\{420\}/)
  assert.match(dashboard, /<ResizableHandle[\s\S]*?aria-label="调整看板侧边栏宽度"/)
  assert.match(shell, /defaultLayout=\{panelLayout\}[\s\S]*?onLayoutChanged=\{handleSidebarLayoutChanged\}/)
  assert.match(shell, /<PersonalDashboard[\s\S]*?defaultLayout=\{panelLayout\}[\s\S]*?onLayoutChanged=\{handleSidebarLayoutChanged\}/)
  assert.doesNotMatch(dashboard, /<Tabs|<TabsList|<TabsTrigger/)
  assert.match(shell, /<Drawer open=\{drawerOpen\}[\s\S]*?direction="right"/)
  assert.match(shell, /<DrawerTitle/)
  assert.match(shell, /<DrawerDescription/)
  assert.match(shell, /const drawerOpen = Boolean\(infoParticipantId/)
  assert.doesNotMatch(shell, /pageViewOpen|DRAWER_TITLES/)
  assert.doesNotMatch(shell, /关闭后返回当前会话，不改变两栏 IM 布局/)
  assert.match(resizable, /ResizablePrimitive\.Group/)
  assert.match(resizable, /ResizablePrimitive\.Panel/)
  assert.match(resizable, /ResizablePrimitive\.Separator/)
  assert.doesNotMatch(shell, /setPointerCapture|onPointerMove|im-floating-context/)
  assert.match(css, /\.desktop-panel-resize-handle > div[\s\S]*?opacity: 0/)
  assert.match(css, /\.desktop-panel-resize-handle:hover > div[\s\S]*?opacity: 1/)
  assert.match(css, /--im-divider: color-mix\(in srgb, var\(--border\) 52%, transparent\)/)
  assert.match(css, /--im-divider-weak: color-mix\(in srgb, var\(--border\) 38%, transparent\)/)
  assert.doesNotMatch(css, /\.desktop-openmaus\s*\{[^}]*--(?:background|foreground|card|border|input|primary|secondary|muted|accent|sidebar):/s)
})

test('personal dashboard exposes the shadcn sidebar destinations in product order', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const dashboard = await readFile(new URL('../desktop/PersonalDashboard.tsx', import.meta.url), 'utf8')
  const renderedMenu = dashboard.slice(dashboard.indexOf('<SidebarMenu>'), dashboard.indexOf('</SidebarMenu>'))
  assert.match(renderedMenu, /我的学习[\s\S]*?课程分组[\s\S]*?DASHBOARD_ITEMS\.slice\(1\)/)
  assert.match(dashboard, /value: 'mail'[\s\S]*?value: 'calendar'[\s\S]*?value: 'library'[\s\S]*?value: 'trust'/)
  assert.match(dashboard, /value: 'courses'[\s\S]*?value: 'projects'[\s\S]*?value: 'organization'/)
  assert.match(dashboard, /adminOnly: true/)
  assert.match(dashboard, /<SidebarUserFooter \/>/)
  assert.match(dashboard, /<SidebarMenuButton isActive=/)
  assert.doesNotMatch(dashboard, /boards|agents|canvas|sources|observability|performance|management/)
  assert.match(shell, /onOpenDashboard=\{\(\) => useApp\.getState\(\)\.setView\('learning'\)\}/)
})

test('dashboard chrome uses shadcn primitives, Hugeicons, and semantic preset tokens', async () => {
  const paths = [
    '../desktop/PersonalDashboard.tsx',
    '../features/companies/components/CompanyCourseManagement.tsx',
    '../features/companies/components/InvitePeopleModal.tsx',
    '../features/calendar/components/CalendarView.tsx',
    '../features/calendar/components/EventEditor.tsx',
    '../features/documents/components/DocumentsView.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/learning/components/LearningCenter.tsx',
    '../features/trust/components/TrustBoard.tsx',
  ]
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  const dashboardChrome = sources.join('\n')
  assert.doesNotMatch(dashboardChrome, /@tabler\/icons-react|@\/components\/icons|@\/components\/Avatar/)
  assert.doesNotMatch(dashboardChrome, /(?:bg|text|border)-(?:white|stone|ink|cloud|app|panel|raised)(?:\b|[-/])/)
  assert.doesNotMatch(dashboardChrome, /shadow-(?:pop|panel|card)|boxShadow:/)
  assert.doesNotMatch(dashboardChrome, /function\s+(?:Field|PageHeader|DashboardCard)\b/)
  assert.doesNotMatch(dashboardChrome, /<(?:button|input|textarea|select)\b/)
  assert.match(dashboardChrome, /@hugeicons\/core-free-icons/)
  const documentEditor = sources[6] ?? ''
  assert.match(documentEditor, /<DropdownMenu[\s\S]*?<Tooltip[\s\S]*?<Dialog[\s\S]*?<Field/)
  assert.match(sources[3] ?? '', /@min-\[48rem\][\s\S]*?<Sheet/)
  assert.match(sources[4] ?? '', /<Dialog open[\s\S]*?<FieldGroup/)
})

test('desktop restores the Luma project workspace rail without restoring company switching', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const rail = await readFile(new URL('../desktop/WorkspaceRail.tsx', import.meta.url), 'utf8')

  assert.match(shell, /<WorkspaceRail[\s\S]*?dashboardActive=\{dashboardOpen\}/)
  assert.match(rail, /useWorkspace\(\(state\) => state\.list\)/)
  assert.match(rail, /useWorkspace\(\(state\) => state\.selectedId\)/)
  assert.match(rail, /await select\(id\)/)
  assert.match(rail, /w-16/)
  assert.match(rail, /bg-accent/)
  assert.match(rail, /aria-label="打开本人看板"/)
  assert.match(rail, /workspace\.kind === 'INSTITUTIONAL_COURSE'/)
  assert.match(rail, /workspace\.kind === 'PERSONAL_LEARNING' && workspace\.isDefault/)
  assert.match(rail, /workspace\.kind === 'TEACHING' && workspace\.createdBy === meId/)
  assert.match(rail, /left\.index - right\.index/)
  assert.match(rail, /<WorkspaceRailGroup workspaces=\{enterprise\}[\s\S]*?<WorkspaceRailGroup workspaces=\{personal\}/)
  assert.match(rail, /<RailDivider \/>/)
  assert.doesNotMatch(rail, /useAuth|setActiveCompany|AuthCompany|WorkspaceCreateDialog/)
})

test('desktop conversation column ends with the sidebar-07 account menu instead of the personal center', async () => {
  const list = await readFile(new URL('../features/conversations/components/ConversationsPane.tsx', import.meta.url), 'utf8')
  const conversationList = await readFile(new URL('../im/ConversationList.tsx', import.meta.url), 'utf8')
  const user = await readFile(new URL('../components/nav-user.tsx', import.meta.url), 'utf8')
  const avatar = await readFile(new URL('../components/ui/avatar.tsx', import.meta.url), 'utf8')
  assert.match(list, /<NavUser user=\{\{ name: authUser\.name, email: authUser\.email, avatar: authParticipant\?\.avatarUrl \}\}/)
  assert.doesNotMatch(list.slice(list.indexOf('{authUser &&')), /setView\('me'\)/)
  assert.match(user, /<DropdownMenuContent[\s\S]*?side="right"/)
  assert.match(user, /Log out/)
  assert.match(user, /aria-label="打开账户菜单"/)
  assert.match(user, /authApi\.logout/)
  assert.doesNotMatch(user, /Account|Notifications|openSettings|setView\('me'\)|Billing|Upgrade to Pro/)
  assert.match(conversationList, /<ConversationAvatar conversation=\{conversation\} size=\{48\}/)
  assert.doesNotMatch(conversationList, /size=\{54\}/)
  assert.doesNotMatch(user, /size=\{54\}|size-13\.5/)
  assert.match(avatar, /Avatar as AvatarPrimitive.*from "radix-ui"/)
})

test('desktop group context opens in the shared Drawer without adding a third panel', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const chat = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')

  assert.match(shell, /setGroupDrawerOpen\(true\)/)
  assert.match(shell, /groupContext && groupDrawerOpen/)
  assert.match(shell, /<ChatPane onOpenGroupContext=/)
  assert.match(chat, /aria-label="打开群聊上下文"/)
  assert.match(shell, /drawerContent = <GroupContextContent/)
  assert.doesNotMatch(shell, /调整上下文栏宽度|GROUP_PANEL_MIN|GROUP_PANEL_MAX|id="detail"/)
})

test('desktop group context is a flat top-bottom surface instead of bordered dashboard cards', async () => {
  const context = await readFile(new URL('../components/GroupContextContent.tsx', import.meta.url), 'utf8')
  const sources = await readFile(new URL('../components/WorkspaceChrome.tsx', import.meta.url), 'utf8')
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const css = await readImStyles()

  assert.match(context, /data-context-layout="flat-stacked"/)
  assert.match(context, /grid-rows-\[minmax\(0,38fr\)_minmax\(0,62fr\)\]/)
  assert.match(context, /<GroupCanvasPanel conversationId=\{conversationId\} flat \/>[\s\S]*<SourcePanel flat/)
  assert.match(context, /<SourcePanel flat toolbar=/)
  assert.doesNotMatch(context, /grid-rows-\[minmax\(0,56fr\)/)
  assert.match(context, /aria-label="打开完整 Canvas"/)
  assert.doesNotMatch(context, />展开<|IconMaximize/)
  assert.match(context, /fill=\{flat\}/)
  assert.match(context, /!flat && <p/)
  assert.match(context, /flat \? 'px-3 pb-2 pt-9'/)
  assert.match(css, /\[data-context-layout='flat-stacked'\][\s\S]*?background: var\(--im-detail-surface\)/)
  assert.match(css, /button\[aria-label='打开完整 Canvas'\][\s\S]*?background: var\(--im-elevated-surface\) !important/)
  assert.match(css, /knowledge-source-panel\[data-source-layout='flat'\][\s\S]*?background: var\(--im-detail-surface\)/)
  assert.match(css, /\.desktop-panel-resize-handle[\s\S]*?background: var\(--im-divider\)/)
  assert.match(sources, /data-source-layout=\{flat \? 'flat' : 'standard'\}/)
  assert.doesNotMatch(shell, /title=\{<div[^>]*>\s*<div[^>]*>群聊上下文/)
})

test('reply text and composer surface do not restore the removed outer rules', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const composer = await readFile(new URL('../im/Composer.tsx', import.meta.url), 'utf8')
  const quoteCard = message.slice(message.indexOf('function QuoteCard'), message.indexOf('function ReplyIconButton'))
  assert.doesNotMatch(quoteCard, /openmaus-quote-card|border-|rounded-/)
  assert.doesNotMatch(composer, /border-t|border-hairline/)
})

test('Coworker cards use semantic light/dark tokens and expose the shared shell marker', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const parts = await readFile(new URL('../components/messages/MessageToolParts.tsx', import.meta.url), 'utf8')
  const activity = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const css = await readImStyles()

  for (const token of ['--panel', '--raised', '--raised-hover', '--hairline', '--ink', '--ink-secondary', '--accent', '--accent-ink']) {
    assert.match(css, new RegExp(`${token}:`))
  }
  assert.match(css, /:root\[data-theme='dark'\]/)
  assert.match(message, /data-message-shell=/)

  const coworkerSource = `${parts.slice(parts.indexOf('function HandoffPart'), parts.indexOf('function LearningMissionPart'))}\n${activity.slice(activity.indexOf('function ConversationActivity'), activity.indexOf('export function ChatPane'))}`
  assert.doesNotMatch(coworkerSource, /bg-sky-50|text-skype-deep|bg-gold\/10|text-gold-deep|bg-white|text-black/)
  assert.match(coworkerSource, /<ProgressTracker/)
  assert.match(coworkerSource, /border-\[var\(--im-divider-weak\)\]/)
  assert.match(coworkerSource, /bg-background/)
  assert.match(coworkerSource, /bg-muted/)
})

test('Canvas bubble and full view share the Card surface and preview theme', async () => {
  const css = await readImStyles()
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const business = await readFile(new URL('../components/messages/MessageBusinessParts.tsx', import.meta.url), 'utf8')
  const attachment = await readFile(new URL('../components/messages/MessageAttachmentCard.tsx', import.meta.url), 'utf8')
  const canvasView = await readFile(new URL('../features/canvas/components/CanvasView.tsx', import.meta.url), 'utf8')
  const canvasPreview = await readFile(new URL('../features/canvas/components/CanvasPreview.tsx', import.meta.url), 'utf8')
  const card = await readFile(new URL('../components/ui/card.tsx', import.meta.url), 'utf8')
  const canvasCard = business.slice(business.indexOf('export function CanvasWorkspaceCard'), business.indexOf('function CalendarArtifactCard'))
  const full = `${css.slice(css.indexOf('.canvas-shell,'), css.indexOf('.canvas-work-timeline {'))}\n${css.slice(css.indexOf('.canvas-frame-card {'), css.indexOf('.canvas-inline-editor,'))}`
  assert.match(card, /data-slot="card"/)
  assert.match(card, /ring-1 ring-foreground\/5/)
  assert.match(card, /dark:ring-foreground\/10/)
  assert.match(card, /--card-spacing/)
  assert.match(full, /var\(--im-chat-surface, var\(--canvas-bg\)\)/)
  assert.match(full, /\.canvas-stage \{[\s\S]*?background-image: none/)
  assert.match(full, /\.canvas-frame-body \{ background: transparent/)
  assert.match(full, /var\(--canvas-frame-accent, var\(--accent\)\)/)
  assert.match(full, /border: 1px solid var\(--input\) !important/)
  assert.match(full, /border-radius: 8px !important/)
  assert.match(full, /box-shadow: 0 0 0 3px color-mix\(in srgb, var\(--canvas-frame-accent, var\(--accent\)\) 50%, transparent\)/)
  assert.match(full, /\.canvas-frame-card\.is-live-editing:not\(\.is-selected\)/)
  assert.match(canvasView, /<Textarea ref=\{editorRef\}/)
  assert.match(canvasView, /canvas-frame-resize-handle/)
  assert.match(css, /\.message-attachment-host \{ width: min\(420px, 100%\); \}/)
  assert.doesNotMatch(css, /\.message-attachment-bubble/)
  assert.match(attachment, /<Attachment state=\{state\}/)
  assert.match(message, /shell\.attachmentHost && 'message-attachment-host'/)
  assert.match(css.slice(css.indexOf('.canvas-preview {'), css.indexOf('.canvas-preview-frame {')), /background-image: none/)
  assert.match(canvasCard, /<CardSurface asChild variant="interactive" interactive/)
  assert.match(canvasCard, /\[--card-spacing:0px\]/)
  assert.doesNotMatch(canvasCard, /message-attachment-bubble|canvas-message-card|hover:-translate-y/)
  assert.doesNotMatch(css, /\.canvas-message-card/)
  assert.doesNotMatch(canvasCard, /statusLabel|members\.slice|canvas\.goal|位智能体|张卡片|className="p-3\.5"/)
  assert.match(css, /--brand-bubble-surface: var\(--muted\)/)
  assert.match(css, /--brand-bubble-border: var\(--border\)/)
  assert.match(css, /--brand-im-blue: var\(--primary\)/)
  assert.match(await readFile(new URL('../components/ui/bubble.tsx', import.meta.url), 'utf8'), /bubble-content\]:bg-primary/)
  assert.doesNotMatch(css, /--bubble-user|\.message-bubble-user/)
  assert.doesNotMatch(canvasPreview, /FRAME_TYPE_LABELS|canvas-preview-frame-header/)
  assert.match(canvasView, /<header[^>]*className="canvas-frame-header cursor-grab active:cursor-grabbing"[^>]*\/>/)
  assert.match(canvasView, /className="canvas-frame-agent-label"/)
  assert.match(canvasView, /owner\?\.name \?\? ownerId/)
  assert.doesNotMatch(canvasView.slice(canvasView.indexOf('return <article data-canvas-frame'), canvasView.indexOf('<div className={`canvas-frame-body')), /TYPE_LABELS|commentCount|participant\?\.name|frame\.revision/)
  assert.doesNotMatch(attachment, /message-attachment-bubble/)
  assert.match(attachment, /<Attachment state=\{state\}/)
  assert.match(attachment, /data-card-variant="media"/)
  assert.match(attachment, /data-card-variant="interactive"/)
  assert.doesNotMatch(`${card}\n${full}`, /background:\s*#(?:fff|000|080808)/i)
})

test('approval is a native Tool UI decision inside the shared attachment host', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const parts = await readFile(new URL('../components/messages/MessageToolParts.tsx', import.meta.url), 'utf8')
  const approval = await readFile(new URL('../components/tool-ui/approval-card/approval-card.tsx', import.meta.url), 'utf8')
  const approvalPart = parts.slice(parts.indexOf('function ApprovalPart'), parts.indexOf('function ToolActivityPart'))
  assert.match(message, /shell\.attachmentHost && 'message-attachment-host'/)
  assert.match(approvalPart, /<ApprovalCard/)
  assert.match(approvalPart, /role="decision"/)
  assert.match(approvalPart, /addResult\(\{ decision, persisted: true \}\)/)
  assert.match(approvalPart, /confirmLabel=/)
  assert.match(approvalPart, /cancelLabel=/)
  assert.match(approval, /data-slot="approval-card"/)
})

test('agent typing state reserves a real bottom row and caps the merged label at two names', async () => {
  const indicator = await readFile(new URL('../components/messages/AgentTypingIndicator.tsx', import.meta.url), 'utf8')
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const css = await readImStyles()

  assert.match(indicator, /const MAX_VISIBLE_AGENTS = 2/)
  assert.doesNotMatch(indicator, /<Avatar\b|<MessageAvatar\b/)
  assert.match(indicator, /role="status"/)
  assert.match(indicator, /data-agent-typing-indicator/)
  assert.match(indicator, /正在输入中/)
  assert.match(indicator, /visible\.map\(\(agent\) => agent\.name\)\.join\('、'\)/)
  assert.match(indicator, /agents\.length > MAX_VISIBLE_AGENTS \? ' 等' : ''/)
  assert.match(desktop, /<AgentTypingIndicator agents=\{typingAgents\}/)
  assert.match(desktop, /grid-rows-\[auto_auto_minmax\(0,1fr\)_auto_auto\]/)
  assert.match(desktop, /<\/div>\s*<AgentTypingIndicator agents=\{typingAgents\}/)
  assert.match(desktop, /message\.streaming !== 'placeholder'/)
  assert.match(indicator, /agent-typing-indicator/)
  assert.match(css, /\.agent-typing-indicator \{\s*background: var\(--im-chat-surface, var\(--panel\)\);/)
})

test('self messages restore the user avatar and author name', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(message, /isMine && 'hidden'/)
  assert.match(message, /\) : \(\s*<MessageAvatar/)
  assert.match(message, /\{groupStart && <span className="[^"]*font-bold[^"]*">\{author\.name\}<\/span>\}/)
  assert.match(message, /className=\{cn\(!isMine && 'gap-3'\)\}/)
})

test('continuation messages omit repeated identity and time while preserving compact alignment', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')

  assert.match(message, /data-message-continuation=\{!groupStart \? 'true' : 'false'\}/)
  assert.match(message, /!groupStart \? \(\s*<MessageAvatar className="!w-12" aria-hidden="true" \/>/)
  assert.match(message, /\{groupStart && <MessageHeader/)
  assert.match(message, /\{groupStart && <span[^>]*>\{author\.name\}<\/span>\}/)
  assert.doesNotMatch(message, /!isStreaming && groupEnd && <span/)
  assert.match(desktop, /continuedFromPrevious \? 'pt-px'/)
  assert.match(desktop, /continuedToNext \? 'pb-px'/)
})

test('bubble reactions anchor opposite the message owner edge', async () => {
  const bubble = await readFile(new URL('../components/messages/ImBubble.tsx', import.meta.url), 'utf8')
  const primitive = await readFile(new URL('../components/ui/bubble.tsx', import.meta.url), 'utf8')

  assert.match(bubble, /<BubbleReactions align=\{isMine \? 'start' : 'end'\}/)
  assert.match(primitive, /start: "left-3"/)
  assert.match(primitive, /end: "right-3"/)
})
