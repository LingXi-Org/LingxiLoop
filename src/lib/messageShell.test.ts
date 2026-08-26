import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createLingxiAssistantMessage, type LingxiImMessageCustom } from '@/im/assistantMessage'
import type { Message, MessageKind, Participant } from '@/types'

test('text, poll, artifact, handoff, and approval receive native IM presentation metadata', () => {
  const participant: Participant = { id: 'agent', kind: 'agent', name: 'Agent', initial: 'A', avatarBg: '#000', status: 'avail' }
  for (const kind of ['text', 'poll', 'tool', 'handoff', 'approval'] as const) {
    const raw: Message = { id: kind, conversationId: 'room', authorId: participant.id, kind: kind as MessageKind, body: '', at: '10:00' }
    const converted = createLingxiAssistantMessage(raw, 0, [raw], { [participant.id]: participant }, 'me')
    const shell = converted.metadata?.custom as unknown as LingxiImMessageCustom
    assert.equal(shell.presentation.variant, 'standard', `${kind} must stay in LingxiImMessage`)
    assert.equal(shell.presentation.quote, true)
    assert.equal(shell.presentation.reactions, true)
    assert.equal(shell.presentation.reply, true)
    assert.equal(shell.presentation.selection, true)
  }
  const presentationFor = (kind: MessageKind) => {
    const raw: Message = { id: kind, conversationId: 'room', authorId: participant.id, kind, body: '', at: '10:00' }
    const converted = createLingxiAssistantMessage(raw, 0, [raw], { [participant.id]: participant }, 'me')
    assert.ok(converted.metadata?.custom)
    return (converted.metadata.custom as unknown as LingxiImMessageCustom).presentation
  }
  assert.equal(presentationFor('handoff').linkPreview, false)
  assert.equal(presentationFor('approval').linkPreview, false)
  assert.equal(presentationFor('approval').attachmentHost, true)
})

test('desktop and mobile both render the native assistant-ui IM entry', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../mobile/MobileChat.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /<LingxiImMessage\b/)
  assert.match(mobile, /<LingxiImMessage\b/)
  assert.match(desktop, /useAuiState\(\(state\) => state\.message\.metadata\.custom\)/)
  assert.match(mobile, /useAuiState\(\(state\) => state\.message\.metadata\.custom\)/)
})

test('web, desktop, and mobile compose the shared IM core without Telegram runtime code', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../mobile/MobileChat.tsx', import.meta.url), 'utf8')
  const desktopProfile = await readFile(new URL('../desktop/InfoPane.tsx', import.meta.url), 'utf8')
  const mobileProfile = await readFile(new URL('../mobile/MobileParticipantInfo.tsx', import.meta.url), 'utf8')
  const desktopList = await readFile(new URL('../desktop/ConversationsPane.tsx', import.meta.url), 'utf8')
  const mobileList = await readFile(new URL('../mobile/MobileChatList.tsx', import.meta.url), 'utf8')
  const desktopShell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const packageJson = await readFile(new URL('../../package.json', import.meta.url), 'utf8')

  for (const component of ['ConversationView', 'MessageList', 'ConversationHeader', 'ComposerSurface']) {
    assert.match(desktop, new RegExp(`<${component}\\b`))
    assert.match(mobile, new RegExp(`<${component}\\b`))
  }
  assert.match(desktopProfile, /<ParticipantProfile\b/)
  assert.match(mobileProfile, /<ParticipantProfile\b/)
  assert.match(desktopList, /<ConversationListItemContent\b/)
  assert.match(mobileList, /<ConversationListItemContent\b/)
  assert.match(desktopShell, /data-group-context=/)
  assert.match(desktopShell, /selectedConversation\?\.kind === 'group'/)
  assert.doesNotMatch(desktopShell, /DesktopNavigation/)
  assert.doesNotMatch(packageJson, /"(?:teact|telegram-tt)"/i)
})

test('desktop chat reserves a scrollable middle row so the composer stays at the bottom', async () => {
  const desktop = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  assert.match(desktop, /chat-surface grid h-full min-h-0 min-w-0 grid-rows-/)
  assert.match(desktop, /grid-rows-\[auto_auto_minmax\(0,1fr\)_auto\]/)
  assert.match(desktop, /data-chat-auxiliary="true"[\s\S]*?<ConversationActivity/)
  assert.doesNotMatch(desktop, /searchOpen[\s\S]{0,160}grid-rows-/)
  assert.match(desktop, /<Composer convoId=\{convoId\} \/>/)
})

test('desktop IM columns resize without changing the message/composer grid contract', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')
  assert.match(shell, /role="separator"/)
  assert.match(shell, /setPointerCapture/)
  assert.match(shell, /LEFT_COLUMN_STORAGE_KEY/)
  assert.match(shell, /--im-left-column-width/)
  assert.match(shell, /requestAnimationFrame/)
  assert.match(shell, /pendingLeftWidthRef/)
  assert.match(shell, /gridRef\.current\?\.style\.setProperty\('--im-left-column-width'/)
  assert.match(css, /grid-template-columns: var\(--im-left-column-width\) minmax\(0, 1fr\)/)
  assert.match(css, /transition: grid-template-columns 300ms cubic-bezier\(\.22, 1, \.36, 1\)/)
  assert.match(css, /\.im-left-resize-handle[\s\S]*?transition: left 300ms cubic-bezier\(\.22, 1, \.36, 1\)/)
  assert.match(css, /body\.im-column-resizing \.desktop-im-grid,[\s\S]*?transition: none !important/)
  assert.doesNotMatch(css, /\.im-(?:left|group-panel|context)-resize-handle::after/)
  assert.doesNotMatch(css, /group-context-splitter|--group-context-width/)
  assert.doesNotMatch(shell, /compactRailClosed|GroupContextRail/)
})

test('mobile self messages align right and never render an avatar slot', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  assert.match(message, /data-message-owner=\{isMine \? 'self' : 'other'\}/)
  assert.match(message, /isMine\s*\? 'flex justify-end'/)
  assert.match(message, /\) : !isMine \? \(/)
  assert.match(message, /!openMaus && isMine && 'ml-auto flex max-w-\[84%\] flex-col items-end'/)
})

test('OpenBot group panel gets a responsive persisted resize handle from its outer shell', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')
  assert.match(shell, /GROUP_PANEL_STORAGE_KEY/)
  assert.match(shell, /clampGroupPanelWidth/)
  assert.match(shell, /detailWidth=\{groupPanelWidth\}/)
  assert.match(shell, /aria-label="调整群聊上下文栏宽度"/)
  assert.match(css, /\.im-group-panel-resize-handle/)
  assert.match(css, /--im-divider: #fcfcfc0d/)
  assert.match(css, /--im-divider: #1414140d/)
})

test('desktop group context delegates its complete panel lifecycle to pinned OpenBot source', async () => {
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const chat = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const panel = await readFile(new URL('../components/layout/detail-panel.tsx', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../mobile/MobileGroupContext.tsx', import.meta.url), 'utf8')

  assert.match(shell, /<DetailPanel/)
  assert.match(shell, /setGroupPanelOpen\(Boolean\(groupContext\)\)/)
  assert.match(shell, /open=\{groupDetailOpen\}/)
  assert.match(shell, /<ChatPane onOpenGroupContext=/)
  assert.match(chat, /aria-label="打开群聊上下文"/)
  assert.match(panel, /animate=\{\{ width: open \? detailWidth : 0 \}\}/)
  assert.match(panel, /duration: shouldReduceMotion \? 0 : ANIMATION_DURATION_SECONDS/)
  assert.match(panel, /\{open \? \(/)
  assert.match(panel, /CONTENT_ENTRANCE_DELAY_SECONDS/)
  assert.match(mobile, /群聊上下文分区/)
})

test('desktop group context is a flat top-bottom surface instead of bordered dashboard cards', async () => {
  const context = await readFile(new URL('../components/GroupContextContent.tsx', import.meta.url), 'utf8')
  const sources = await readFile(new URL('../components/WorkspaceChrome.tsx', import.meta.url), 'utf8')
  const shell = await readFile(new URL('../desktop/DesktopApp.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')

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
  assert.match(css, /:has\(\[data-context-layout='flat-stacked'\]\)/)
  assert.match(css, /\[data-context-layout='flat-stacked'\][\s\S]*?background: var\(--im-detail-surface\)/)
  assert.match(css, /button\[aria-label='打开完整 Canvas'\][\s\S]*?background: var\(--im-elevated-surface\) !important/)
  assert.match(css, /knowledge-source-panel\[data-source-layout='flat'\][\s\S]*?background: var\(--im-detail-surface\)/)
  assert.match(css, /border-left-color: var\(--im-divider\) !important/)
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
  const parts = await readFile(new URL('../components/messages/LingxiMessageParts.tsx', import.meta.url), 'utf8')
  const activity = await readFile(new URL('../desktop/ChatPane.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')

  for (const token of ['--panel', '--raised', '--raised-hover', '--hairline', '--ink', '--ink-secondary', '--accent', '--accent-ink']) {
    assert.match(css, new RegExp(`${token}:`))
  }
  assert.match(css, /:root\[data-theme='dark'\]/)
  assert.match(message, /data-message-shell=/)

  const coworkerSource = `${parts.slice(parts.indexOf('function HandoffPart'), parts.indexOf('function LearningMissionPart'))}\n${activity.slice(activity.indexOf('function ConversationActivity'), activity.indexOf('export function ChatPane'))}`
  assert.doesNotMatch(coworkerSource, /bg-sky-50|text-skype-deep|bg-gold\/10|text-gold-deep|bg-white|text-black/)
  assert.match(coworkerSource, /border-hairline/)
  assert.match(coworkerSource, /bg-panel/)
  assert.match(coworkerSource, /bg-raised/)
})

test('Canvas bubble and full view share the attachment preview theme surfaces', async () => {
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8')
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const business = await readFile(new URL('../components/messages/MessageBusinessParts.tsx', import.meta.url), 'utf8')
  const canvasView = await readFile(new URL('../components/CanvasView.tsx', import.meta.url), 'utf8')
  const canvasPreview = await readFile(new URL('../components/CanvasPreview.tsx', import.meta.url), 'utf8')
  const bubble = css.slice(css.indexOf('.canvas-message-card {'), css.indexOf('.canvas-preview {'))
  const canvasCard = business.slice(business.indexOf('export function CanvasWorkspaceCard'), business.indexOf('function BoardArtifactCard'))
  const full = `${css.slice(css.indexOf('.canvas-shell,'), css.indexOf('.canvas-work-timeline {'))}\n${css.slice(css.indexOf('.canvas-frame-card {'), css.indexOf('.canvas-inline-editor,'))}`
  assert.match(bubble, /border-color: var\(--brand-bubble-border\)/)
  assert.match(bubble, /background: var\(--brand-bubble-surface\)/)
  assert.match(bubble, /box-shadow: 0 1px 0 var\(--hairline\)/)
  assert.match(full, /var\(--im-chat-surface, var\(--canvas-bg\)\)/)
  assert.match(full, /\.canvas-stage \{[\s\S]*?background-image: none/)
  assert.match(full, /background: var\(--panel\)/)
  assert.match(full, /var\(--canvas-frame-accent, var\(--accent\)\)/)
  assert.match(full, /border: 0 !important/)
  assert.match(css, /\.message-attachment-host \{ width: min\(420px, 100%\); \}/)
  assert.match(css, /\.message-attachment-bubble \{[\s\S]*?width: 100%; max-width: 100%;[\s\S]*?background: var\(--brand-bubble-surface\) !important;/)
  assert.match(message, /shell\.attachmentHost && 'message-attachment-host'/)
  assert.match(css.slice(css.indexOf('.canvas-preview {'), css.indexOf('.canvas-preview-frame {')), /background-image: none/)
  assert.match(business, /message-attachment-bubble canvas-message-card/)
  assert.doesNotMatch(canvasCard, /hover:-translate-y|canvas-message-card[^\n]*transition/)
  assert.doesNotMatch(css, /\.canvas-message-card:hover/)
  assert.doesNotMatch(canvasCard, /statusLabel|members\.slice|canvas\.goal|位智能体|张卡片|className="p-3\.5"/)
  assert.match(css, /--brand-bubble-surface: #EEEEEE/)
  assert.match(css, /--brand-bubble-surface: #262626/)
  assert.match(css, /--bubble-user: #1084FE/)
  assert.match(css, /--bubble-user: #4682f6/)
  assert.match(css, /:root\[data-theme='light'\] :is\(\.desktop-openmaus, \.mobile-grok-shell\) \.message-bubble-user \{[\s\S]*?background: #4682f6;/)
  assert.doesNotMatch(canvasPreview, /FRAME_TYPE_LABELS|canvas-preview-frame-header/)
  assert.match(canvasView, /<header[^>]*className="canvas-frame-header cursor-grab active:cursor-grabbing"[^>]*\/>/)
  assert.match(canvasView, /className="canvas-frame-agent-label"/)
  assert.match(canvasView, /owner\?\.name \?\? ownerId/)
  assert.doesNotMatch(canvasView.slice(canvasView.indexOf('return <article data-canvas-frame'), canvasView.indexOf('<div className={`canvas-frame-body')), /TYPE_LABELS|commentCount|participant\?\.name|frame\.revision/)
  assert.equal((business.match(/message-attachment-bubble/g) ?? []).length, 5)
  assert.doesNotMatch(`${bubble}\n${full}`, /background:\s*#(?:fff|000|080808)/i)
})

test('approval is a native Tool UI decision inside the shared attachment host', async () => {
  const message = await readFile(new URL('../components/messages/LingxiImMessage.tsx', import.meta.url), 'utf8')
  const parts = await readFile(new URL('../components/messages/LingxiMessageParts.tsx', import.meta.url), 'utf8')
  const approval = await readFile(new URL('../components/tool-ui/approval-card/approval-card.tsx', import.meta.url), 'utf8')
  const approvalPart = parts.slice(parts.indexOf('function ApprovalPart'), parts.indexOf('function ToolActivityPart'))
  assert.match(message, /shell\.attachmentHost && 'message-attachment-host'/)
  assert.match(approvalPart, /<ApprovalCard/)
  assert.match(approvalPart, /role="decision"/)
  assert.match(approvalPart, /addResult\(\{ decision \}\)/)
  assert.match(approvalPart, /confirmLabel=/)
  assert.match(approvalPart, /cancelLabel=/)
  assert.match(approval, /data-slot="approval-card"/)
})
