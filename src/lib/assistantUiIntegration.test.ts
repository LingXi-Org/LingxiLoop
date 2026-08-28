import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const runtime = read('../im/assistantRuntime.tsx')
const assistantMessage = read('../im/assistantMessage.ts')
const messageList = read('../im/MessageList.tsx')
const parts = read('../components/messages/LingxiMessageParts.tsx')
const contentParts = read('../components/messages/MessageContentParts.tsx')
const toolParts = read('../components/messages/MessageToolParts.tsx')
const mediaParts = read('../components/messages/MessageMediaParts.tsx')
const message = read('../components/messages/LingxiImMessage.tsx')
const avatar = read('../components/Avatar.tsx')
const bloubAvatar = read('../components/BloubAvatar.tsx')
const reactions = read('../components/messages/MessageReactions.tsx')
const quote = read('../components/messages/MessageQuote.tsx')
const system = read('../components/messages/SystemMessageRow.tsx')
const bubble = read('../components/messages/ImBubble.tsx')
const bubblePrimitive = read('../components/ui/bubble.tsx')
const messagePrimitive = read('../components/ui/message.tsx')
const cardPrimitive = read('../components/ui/card.tsx')
const contextMenuPrimitive = read('../components/ui/context-menu.tsx')
const dropdownMenuPrimitive = read('../components/ui/dropdown-menu.tsx')
const scrollAreaPrimitive = read('../components/ui/scroll-area.tsx')
const canvasView = read('../components/CanvasView.tsx')
const groupCreator = read('../features/conversations/components/GroupCreator.tsx')
const dialog = read('../components/ui/dialog.tsx')
const contextMenu = `${message}\n${canvasView}`
const textareaPrimitive = read('../components/ui/textarea.tsx')
const inputPrimitive = read('../components/ui/input.tsx')
const inputGroupPrimitive = read('../components/ui/input-group.tsx')
const canvasFrameContent = read('../components/CanvasFrameContent.tsx')
const attachmentPrimitive = read('../components/ui/attachment.tsx')
const attachmentCard = read('../components/messages/MessageAttachmentCard.tsx')
const emailComposer = read('../components/EmailComposer.tsx')
const drawerPrimitive = read('../components/ui/drawer.tsx')
const chatStyles = read('../styles/chat.css')
const globalStyles = read('../styles/globals.css') + chatStyles
const desktopComposer = read('../desktop/ChatComposer.tsx')
const markdown = read('../components/assistant-ui/markdown-text.tsx')
const typesetRenderer = read('../components/Typeset.tsx')
const typesetStyles = read('../styles/typeset.css')
const messageBody = read('../components/messages/MessageBody.tsx')
const attachmentViewer = read('../components/AttachmentViewer.tsx')
const documentEditor = read('../components/DocumentEditor.tsx')
const updaterDialog = read('../components/UpdaterDialog.tsx')
const reasoning = read('../components/assistant-ui/elements/reasoning-panel.tsx')
const surfaces = read('../components/assistant-ui/elements/surfaces.tsx')
const styles = globalStyles
const businessParts = read('../components/messages/MessageBusinessParts.tsx')
const groupContext = read('../components/GroupContextContent.tsx')
const poll = read('../components/PollBubble.tsx')
const questionnaire = read('../components/QuestionnaireBubble.tsx')
const questionnairePrimitive = read('../components/ui/questionnaire.tsx')
const optionList = read('../components/tool-ui/option-list/option-list.tsx')
const codeBlock = read('../components/tool-ui/code-block/code-block.tsx')
const promptKitTool = read('../components/prompt-kit/tool.tsx')
const readReceiptStatus = read('../components/messages/ReadReceiptStatus.tsx')
const threadDrawer = read('../desktop/ThreadDrawer.tsx')

test('optional Zustand collections use stable empty snapshots', () => {
  assert.match(readReceiptStatus, /const EMPTY_READ_RECEIPTS/)
  assert.match(readReceiptStatus, /\?\? EMPTY_READ_RECEIPTS/)
  assert.doesNotMatch(readReceiptStatus, /readReceipts\[message\.conversationId\] \?\? \[\]/)
  assert.match(threadDrawer, /const EMPTY_MESSAGES/)
  assert.match(
    threadDrawer,
    /const convoMessages = useMessages\([\s\S]*?\?\? EMPTY_MESSAGES\) : EMPTY_MESSAGES/,
  )
})

test('assistant-ui wraps virtual rows without taking over the IM viewport', () => {
  assert.match(runtime, /useExternalStoreRuntime<Message>/)
  assert.match(runtime, /AssistantRuntimeProvider/)
  assert.match(messageList, /ThreadPrimitive\.Unstable_MessageById/)
  assert.match(messageList, /<Virtuoso/)
  assert.doesNotMatch(messageList, /ThreadPrimitive\.Viewport/)
})

test('native metadata.custom is the only IM row input', () => {
  assert.match(assistantMessage, /custom: metadata/)
  assert.match(assistantMessage, /schema: 'lingxi\.im\.message\.v1'/)
  assert.match(assistantMessage, /message,/)
  assert.match(message, /useAuiState\(\(state\) => state\.message\.metadata\.custom\)/)
  assert.match(message, /const \{ message: msg, sender: author \} = custom/)
  assert.match(message, /const isMine = custom\.isMine/)
  const nativeProps = message.slice(message.indexOf('interface LingxiImMessageProps'), message.indexOf('function LingxiImMessageImpl'))
  assert.doesNotMatch(nativeProps, /\bmsg\??:/)
  assert.doesNotMatch(assistantMessage, /messageConverter|useLingxiImMessage/)
})

test('all primary payloads render through MessagePrimitive.Parts with no fallback renderer', () => {
  assert.match(parts, /<MessagePrimitive\.Parts>/)
  for (const mapping of ['lingxi_approval', 'lingxi_tool_activity', 'lingxi_questionnaire', 'lingxi_poll', 'lingxi_handoff', 'lingxi_learning_mission', 'lingxi_email', 'lingxi_canvas', 'lingxi_citations']) {
    assert.ok(parts.includes(mapping), `missing ${mapping}`)
  }
  assert.doesNotMatch(parts, /UnsupportedPart|tool-ui-unsupported-part|unserializable payload/)
  assert.match(parts, /throw new Error\(`Unregistered native/)
})

test('the first-party IM shell is rooted in assistant-ui and owns the bubble layout', () => {
  assert.match(message, /<MessagePrimitive\.Root/)
  assert.match(contentParts, /<ImBubble/)
  assert.match(message, /<Message/)
  assert.match(message, /<MessageAvatar/)
  assert.match(message, /<MessageHeader/)
  assert.match(message, /<MessageFooter/)
  assert.match(bubble, /data-im-bubble/)
  assert.match(bubble, /variant=\{isMine \? 'default' : 'secondary'\}/)
  assert.match(bubble, /align=\{isMine \? 'end' : 'start'\}/)
  assert.match(surfaces, /bg-background border border-border\/60 dark:bg-popover/)
  assert.doesNotMatch(message, /\b(?:msg|message)\.kind\b/)
  assert.match(message, /shell\.bubble/)
  assert.match(assistantMessage, /bubble: boolean/)
})

test('text and reasoning use assistant-ui parsing with the shared Typeset contract', () => {
  assert.match(contentParts, /<MarkdownText \/>/)
  assert.match(contentParts, /<ReasoningPanel/)
  assert.match(markdown, /MarkdownTextPrimitive/)
  assert.match(markdown, /typeset typeset-chat/)
  assert.doesNotMatch(markdown, /dot\.css|defaultComponents/)
  assert.match(reasoning, /data-slot="reasoning-panel"/)
  assert.match(reasoning, /collapsePanel/)
})

test('official Elements and Tool UI visual contracts remain intact', () => {
  assert.match(runtime, /className="assistant-ui-scope aui-thread-root/)
  assert.match(surfaces, /transition-\[background-color,color,scale\]/)
  assert.match(surfaces, /motion-reduce:transition-none/)
  assert.match(reasoning, /group-data-panel-open\/trigger:rotate-180/)
  assert.match(optionList, /import\.meta\.env\.DEV/)
})

test('approval is single-flight and feeds assistant-ui addResult into the native API', () => {
  assert.match(toolParts, /if \(!pending \|\| busy\) return/)
  assert.match(toolParts, /addResult\(\{ decision \}\)/)
  assert.match(runtime, /onAddToolResult/)
  assert.match(runtime, /agentsApi\.resolveApproval/)
})

test('questions and polls share the accessible base-nova Questionnaire contract', () => {
  assert.match(questionnairePrimitive, /@shadcn\/react\/questionnaire/)
  for (const slot of ['questionnaire', 'questionnaire-progress', 'questionnaire-item', 'questionnaire-title', 'questionnaire-description', 'questionnaire-choices', 'questionnaire-choice', 'questionnaire-choice-input', 'questionnaire-choice-label', 'questionnaire-choice-shortcut', 'questionnaire-input', 'questionnaire-error', 'questionnaire-actions', 'questionnaire-previous', 'questionnaire-skip', 'questionnaire-next', 'questionnaire-submit']) {
    assert.ok(questionnairePrimitive.includes(`data-slot="${slot}"`))
  }
  assert.match(questionnaire, /sendUserMessage\(message\.conversationId, body, null, message\.id\)/)
  assert.match(questionnaire, /shortcuts="letters"/)
  assert.match(questionnaire, /<QuestionnaireSkip>/)
  assert.match(poll, /<Questionnaire/)
  assert.match(poll, /messagesApi\.castPollVote/)
  assert.match(poll, /VoterStack/)
})

test('media uses the shared Attachment composition and malformed payload renderers are absent', () => {
  assert.match(mediaParts, /return <AttachmentCard \/>/)
  assert.doesNotMatch(mediaParts, /ToolUIImage|<Audio|<Video/)
  for (const slot of ['attachment', 'attachment-media', 'attachment-content', 'attachment-title', 'attachment-description', 'attachment-actions', 'attachment-action', 'attachment-group']) assert.ok(attachmentPrimitive.includes(`data-slot="${slot}"`))
  assert.match(attachmentPrimitive, /slot: "attachment-trigger"/)
  assert.match(attachmentPrimitive, /scroll-fade-x/)
  assert.match(attachmentPrimitive, /scrollbar-none/)
  assert.match(attachmentCard, /<AttachmentMedia/)
  assert.match(attachmentCard, /<AttachmentContent/)
  assert.match(attachmentCard, /<AttachmentTrigger/)
  assert.match(emailComposer, /<AttachmentGroup/)
  assert.match(desktopComposer, /<Attachment size="sm"/)
  assert.match(businessParts, /function EmailAttachmentRow[\s\S]*?<Attachment size="xs"/)
  assert.match(codeBlock, /getDocumentTheme\(\) \?\? getSystemTheme\(\)/)
  assert.match(codeBlock, /resolvedTheme === "dark"/)
  assert.doesNotMatch(parts, /malformed|fallback/i)
})

test('email composer uses the official Base UI controlled Drawer composition', () => {
  for (const slot of [
    'drawer',
    'drawer-trigger',
    'drawer-close',
    'drawer-portal',
    'drawer-overlay',
    'drawer-viewport',
    'drawer-popup',
    'drawer-content',
    'drawer-swipe-handle',
    'drawer-header',
    'drawer-footer',
    'drawer-title',
    'drawer-description',
  ]) assert.ok(drawerPrimitive.includes(`data-slot="${slot}"`), `missing ${slot}`)
  assert.match(drawerPrimitive, /Drawer as DrawerPrimitive.*@base-ui\/react\/drawer/)
  assert.match(drawerPrimitive, /DrawerPrimitive\.Backdrop/)
  assert.match(drawerPrimitive, /DrawerPrimitive\.Viewport/)
  assert.match(drawerPrimitive, /DrawerPrimitive\.Popup/)
  assert.match(drawerPrimitive, /DrawerPrimitive\.Content/)
  assert.match(drawerPrimitive, /data-swipe-axis=\{swipeAxis\}/)
  assert.match(drawerPrimitive, /data-\[swipe-direction=right\]:right-0/)
  assert.match(emailComposer, /<Drawer open=\{open\} onOpenChange=[\s\S]*?swipeDirection="right"/)
  assert.match(emailComposer, /<DrawerContent/)
  assert.match(emailComposer, /<DrawerHeader/)
  assert.match(emailComposer, /<DrawerTitle/)
  assert.match(emailComposer, /<DrawerDescription/)
  assert.match(emailComposer, /<DrawerClose/)
  assert.match(emailComposer, /<DrawerFooter/)
  assert.doesNotMatch(emailComposer, /Sheet(Content|Header|Title|Description|Footer)?/)
  assert.match(globalStyles, /body \{\s*position: relative;/)
  assert.doesNotMatch(emailComposer, /email-composer-backdrop|email-composer-panel|animate-slide-in-right|fixed inset-0 z-\[55\]/)
})

test('reply, reactions, retry, menu and read state stay outside Parts in the IM shell', () => {
  const partsIndex = message.indexOf('<LingxiMessageParts')
  assert.ok(partsIndex >= 0)
  for (const marker of ['<ReadReceiptStatus', 'retryFailedMessage', 'ReactionPill', '<ContextMenu']) {
    assert.ok(message.includes(marker), `missing outer shell marker ${marker}`)
  }
  assert.doesNotMatch(message, /message-action-tray|QuickReactionButton|ReplyIconButton|在线程中打开/)
  assert.match(reactions, /data-message-surface="overlay"/)
  assert.match(quote, /data-message-surface="inset"/)
  assert.match(system, /data-message-surface="status"/)
})

test('native tool activity uses localized service presentation without exposing IPython', () => {
  assert.match(toolParts, /import \{ Tool, type ToolPart \} from '@\/components\/prompt-kit\/tool'/)
  assert.match(toolParts, /type: presentation\.label/)
  assert.match(toolParts, /service: presentation\.tone/)
  assert.doesNotMatch(toolParts, /type: 'ipython'/)
  for (const scope of ['设计与媒体', '沟通与协作', '开发与代码', '知识与数据', '网页与检索', '自动化能力']) assert.ok(toolParts.includes(scope))
  assert.match(toolParts, /input: \{ operation: tool\.name, code: tool\.arg \}/)
  for (const state of ['input-streaming', 'input-available', 'output-available', 'output-error']) assert.ok(promptKitTool.includes(`"${state}"`))
  assert.match(promptKitTool, /data-slot="tool"/)
  assert.match(promptKitTool, /data-tool-scope/)
  assert.match(toolParts, /className="w-full max-w-md"/)
  assert.match(assistantMessage, /tool: \{ \.\.\.STRUCTURED_PRESENTATION, attachmentHost: true, bubble: true, avatarAlignment: 'top' \}/)
  assert.doesNotMatch(promptKitTool, /max-w-\[(?:420px|580px)\]/)
  assert.match(promptKitTool, /animate-collapsible-down/)
  assert.match(promptKitTool, /<CollapsibleTrigger/)
  assert.match(promptKitTool, /const openToolCalls = new Set<string>\(\)/)
  assert.match(promptKitTool, /openToolCalls\.has\(openKey\)/)
  assert.match(promptKitTool, /aria-label=\{isOpen \? `收起\$\{toolPart\.type\}` : `展开\$\{toolPart\.type\}`\}/)
  assert.match(promptKitTool, /transition-transform", isOpen && "rotate-180"/)
  assert.match(message, /shell\.avatarAlignment === 'top' && '!self-start !translate-y-0'/)
  assert.match(assistantMessage, /tool: \{ \.\.\.STRUCTURED_PRESENTATION,[^\n]*avatarAlignment: 'top'/)
  assert.match(promptKitTool, /<CollapsibleTrigger asChild>/)
  assert.match(promptKitTool, /<button\s+type="button"/)
  assert.match(promptKitTool, />执行参数</)
  assert.match(promptKitTool, />执行结果</)
  assert.match(promptKitTool, />错误信息</)
  const activity = toolParts.slice(toolParts.indexOf('export function ToolActivityPart'), toolParts.indexOf('export function HandoffPart'))
  assert.doesNotMatch(activity, /ProgressTracker/)
})

test('message surfaces expose stable visual variants without owning message protocol decisions', () => {
  for (const variant of ['bubble', 'inset', 'overlay', 'status']) assert.ok(surfaces.includes(`"${variant}"`))
  for (const variant of ['default', 'interactive', 'destructive', 'parchment', 'media']) assert.ok(surfaces.includes(`"${variant}"`))
  for (const status of ['pending', 'running', 'success', 'failed', 'expired']) assert.ok(surfaces.includes(`"${status}"`))
  assert.match(surfaces, /data-message-surface/)
  assert.match(surfaces, /data-card-variant/)
  for (const slot of ['card', 'card-header', 'card-title', 'card-description', 'card-action', 'card-content', 'card-footer']) {
    assert.ok(cardPrimitive.includes(`data-slot="${slot}"`))
  }
  assert.match(cardPrimitive, /data-size=\{size\}/)
  assert.match(cardPrimitive, /--card-spacing/)
  assert.match(surfaces, /const Component = asChild \? Slot : Card/)
  assert.match(businessParts, /<CardSurface asChild variant="interactive" interactive/)
  assert.match(groupContext, /<CardSurface asChild variant="interactive" interactive/)
  assert.match(bubble, /<MessageSurface/)
  for (const variant of ['default', 'secondary', 'muted', 'tinted', 'outline', 'ghost', 'destructive']) assert.ok(bubblePrimitive.includes(`${variant}:`))
  assert.match(bubblePrimitive, /max-w-\[80%\]/)
  assert.match(bubblePrimitive, /data-variant=\{variant\}/)
  assert.match(bubblePrimitive, /rounded-3xl/)
  assert.match(bubblePrimitive, /data-slot="bubble-reactions"/)
  assert.match(bubblePrimitive, /ring-3 ring-card/)
  assert.match(bubblePrimitive, /translate-y-3\/4/)
  assert.match(bubble, /<BubbleReactions/)
  assert.match(parts, /bubbleReactions/)
  assert.match(bubblePrimitive, /focus-visible:ring-3/)
  for (const slot of ['message', 'message-avatar', 'message-content', 'message-header', 'message-footer']) assert.ok(messagePrimitive.includes(`data-slot="${slot}"`))
  assert.match(messagePrimitive, /data-align=\{align\}/)
  assert.match(messagePrimitive, /group-has-data-\[slot=message-footer\]\/message:-translate-y-8/)
  const avatarSlot = messagePrimitive.slice(messagePrimitive.indexOf('function MessageAvatar'), messagePrimitive.indexOf('function MessageContent'))
  assert.doesNotMatch(avatarSlot, /overflow-hidden|rounded-full|bg-muted|min-w-8/)
  assert.match(message, /size=\{48\}/)
  assert.match(message, /ringColor="transparent"/)
  assert.match(message, /chat-message-avatar/)
  assert.match(message, /mode="chat"/)
  assert.match(avatar, /mode = 'neutral'/)
  assert.match(bloubAvatar, /mode === 'chat' \? getBloubState\(participant, status\) : 'idle'/)
  assert.match(bloubAvatar, /mode === 'chat' && animated/)
  assert.match(styles, /\.chat-message-avatar \.bloub-avatar-alive/)
  assert.match(styles, /@keyframes chat-message-avatar-float/)
  assert.doesNotMatch(bubble, /rounded-(?:l|r|t|b|tl|tr|bl|br)-(?:2xl|md)/)
})

test('desktop right-click actions use the shared Base UI context menu', () => {
  for (const slot of ['context-menu', 'context-menu-trigger', 'context-menu-content', 'context-menu-item', 'context-menu-sub', 'context-menu-sub-content', 'context-menu-separator']) {
    assert.ok(contextMenuPrimitive.includes(`data-slot="${slot}"`))
  }
  assert.match(contextMenuPrimitive, /@base-ui\/react\/context-menu/)
  assert.match(contextMenuPrimitive, /data-\[variant=destructive\]/)
  assert.match(contextMenu, /<ContextMenuTrigger/)
  assert.match(contextMenu, /<ContextMenuSubTrigger/)
  assert.doesNotMatch(contextMenu, /components\/ContextMenu|\.\.\/ContextMenu/)
  assert.doesNotMatch(contextMenu, /dispatchEvent\(new MouseEvent\('contextmenu'/)
})

test('Canvas editors retain the base-nova Textarea contract', () => {
  assert.match(textareaPrimitive, /data-slot="textarea"/)
  for (const token of ['field-sizing-content', 'rounded-lg', 'border-input', 'focus-visible:border-ring', 'focus-visible:ring-3', 'aria-invalid:border-destructive', 'dark:bg-input/30']) {
    assert.ok(textareaPrimitive.includes(token))
  }
})

test('text inputs and grouped controls retain the base-nova contracts', () => {
  assert.match(inputPrimitive, /@base-ui\/react\/input/)
  assert.match(inputPrimitive, /data-slot="input"/)
  for (const token of ['rounded-lg', 'border-input', 'focus-visible:border-ring', 'focus-visible:ring-3', 'aria-invalid:border-destructive', 'dark:bg-input/30']) assert.ok(inputPrimitive.includes(token))
  for (const slot of ['input-group', 'input-group-addon', 'input-group-control']) assert.ok(inputGroupPrimitive.includes(`data-slot="${slot}"`))
  assert.match(inputGroupPrimitive, /has-\[\[data-slot=input-group-control\]:focus-visible\]:ring-3/)
})

test('Canvas markdown and document frames both render GFM markdown', () => {
  assert.match(canvasFrameContent, /frame\.type === 'markdown' \|\| frame\.type === 'document'/)
  assert.match(canvasFrameContent, /<TypesetMarkdown/)
  assert.match(canvasFrameContent, /preset=\{preview \? 'preview' : 'canvas'\}/)
  assert.match(typesetRenderer, /remarkGfm, remarkBreaks, \.\.\.remarkPlugins/)
  assert.match(typesetRenderer, /skipHtml/)
  assert.doesNotMatch(canvasFrameContent, /react-markdown|remark-gfm|remark-breaks/)
  assert.doesNotMatch(canvasFrameContent, /prose prose-sm/)
  assert.doesNotMatch(canvasFrameContent, /if \(frame\.type === 'document'\)/)
})

test('all rendered prose uses the official Typeset styling contract', () => {
  for (const token of [
    '@layer components',
    '.typeset',
    '--typeset-font-body',
    '--typeset-flow',
    'margin-trim',
    ':where(',
    'not-typeset',
  ]) assert.ok(typesetStyles.includes(token), `missing Typeset token ${token}`)

  assert.match(typesetRenderer, /className=\{cn\('typeset', presetClass\[preset\]/)
  assert.match(typesetRenderer, /data-typeset-preset=\{preset\}/)
  assert.match(messageBody, /<TypesetMarkdown/)
  assert.doesNotMatch(messageBody, /\bh[1-6]:|\bblockquote:|\btable:/)
  assert.match(attachmentViewer, /<TypesetMarkdown/)
  assert.match(documentEditor, /tiptap typeset typeset-document/)
  assert.doesNotMatch(documentEditor, /\bprose\b/)
  assert.match(updaterDialog, /<TypesetMarkdown content=\{notes\} preset="document"/)

  for (const legacySelector of [
    '.canvas-frame-markdown h1',
    '.markdown-attachment-preview h1',
    '.tiptap h1',
  ]) assert.ok(!globalStyles.includes(legacySelector), `legacy typography remains: ${legacySelector}`)
})

test('global menus expose the complete Base UI dropdown composition', () => {
  for (const slot of ['dropdown-menu', 'dropdown-menu-trigger', 'dropdown-menu-content', 'dropdown-menu-group', 'dropdown-menu-label', 'dropdown-menu-item', 'dropdown-menu-sub', 'dropdown-menu-sub-content', 'dropdown-menu-checkbox-item', 'dropdown-menu-radio-group', 'dropdown-menu-radio-item', 'dropdown-menu-separator', 'dropdown-menu-shortcut']) {
    assert.ok(dropdownMenuPrimitive.includes(`data-slot="${slot}"`))
  }
  assert.match(dropdownMenuPrimitive, /@base-ui\/react\/menu/)
  assert.match(dropdownMenuPrimitive, /cn-menu-target cn-menu-translucent/)
  assert.match(dropdownMenuPrimitive, /variant\?: "default" \| "destructive"/)
})

test('group creation uses the shared Base UI Dialog instead of a handwritten overlay', () => {
  assert.match(dialog, /@base-ui\/react\/dialog/)
  assert.match(groupCreator, /<Dialog open/)
  assert.match(groupCreator, /<DialogContent/)
  assert.match(groupCreator, /<DialogTitle/)
  assert.match(groupCreator, /<DialogDescription/)
  assert.doesNotMatch(groupCreator, /fixed inset-0 z-50 grid place-items-center/)
  assert.doesNotMatch(dialog, /@radix-ui\/react-dialog/)
})

test('scrolling surfaces use the base-nova Scroll Area contract', () => {
  assert.match(scrollAreaPrimitive, /@base-ui\/react\/scroll-area/)
  for (const slot of ['scroll-area', 'scroll-area-viewport', 'scroll-area-scrollbar', 'scroll-area-thumb']) {
    assert.ok(scrollAreaPrimitive.includes(`data-slot="${slot}"`))
  }
  assert.match(scrollAreaPrimitive, /<ScrollBar \/>/)
  assert.match(scrollAreaPrimitive, /<ScrollAreaPrimitive\.Corner \/>/)
  assert.match(scrollAreaPrimitive, /orientation = "vertical"/)
  assert.match(scrollAreaPrimitive, /data-horizontal:h-2\.5/)
  assert.match(scrollAreaPrimitive, /data-vertical:w-2\.5/)
  assert.match(styles, /scrollbar-color: var\(--border\) transparent/)
  assert.match(styles, /\*::-webkit-scrollbar \{ width: 10px; height: 10px; \}/)
})
