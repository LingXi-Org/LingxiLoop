import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

test('frontend API implementations and consumers stay domain-scoped', async () => {
  await assert.rejects(access(new URL('./client.ts', import.meta.url)))
  await assert.rejects(access(new URL('./calendar.ts', import.meta.url)))
  await assert.rejects(access(new URL('./files.ts', import.meta.url)))
  await assert.rejects(access(new URL('./observability.ts', import.meta.url)))
  await assert.rejects(access(new URL('./platform.ts', import.meta.url)))

  for (const path of [
    '../auth/api.ts', '../auth/contracts.ts',
    '../features/platform/api.ts', '../features/platform/contracts.ts',
  ]) await access(new URL(path, import.meta.url))

  const platformSources = await Promise.all([
    './core/http.ts', '../auth/api.ts',
    '../features/platform/api.ts', '../features/conversations/api.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(platformSources.join('\n'), /lingxiloop\.serverUrl|setServerOrigin|platformApi|filesApi|observabilityApi/)
  assert.match(platformSources[2], /export const uploadsApi =/)
  assert.match(platformSources[3], /search:/)
  assert.doesNotMatch(platformSources[3], /platformApi/)

  await assert.rejects(access(new URL('../admin/api.ts', import.meta.url)))
  await assert.rejects(access(new URL('../admin/AdminApp.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../features/admin/api.ts', import.meta.url)))
  await assert.rejects(access(new URL('../features/admin/components/AdminApp.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../features/eval/api.ts', import.meta.url)))
  await assert.rejects(access(new URL('../features/eval/components/EvalPage.tsx', import.meta.url)))

  const consumers = await Promise.all([
    '../features/chat/state/messages.ts', '../features/conversations/store.ts', '../features/boards/state.ts',
    '../features/calendar/state.ts', '../features/canvas/state.ts', '../features/documents/state.ts',
    '../features/knowledge/state.ts', '../features/agents/state.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(consumers.join('\n'), /api\/client|\bapi\.[A-Za-z]/)

  for (const file of [
    'api.ts', 'contracts.ts', 'state.ts',
    'components/CalendarView.tsx', 'components/CalendarPeekPane.tsx',
    'components/CalendarEventPeekContent.tsx', 'components/CalendarLink.tsx',
    'components/EventEditor.tsx',
  ]) {
    await access(new URL(`../features/calendar/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('../desktop/CalendarView.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../desktop/CalendarPeekPane.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../components/CalendarLink.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../components/EventEditor.tsx', import.meta.url)))
  const calendarState = await readFile(new URL('../features/calendar/state.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(calendarState, /stores\/calendar|api\/calendar/)
  const loadEvent = calendarState.slice(
    calendarState.indexOf('async loadEvent'),
    calendarState.indexOf('async reload'),
  )
  assert.match(loadEvent, /calendarApi\.get\(id\)/)
  assert.doesNotMatch(loadEvent, /calendarApi\.list\(/)
  const calendarSources = await Promise.all([
    '../features/calendar/api.ts',
    '../features/calendar/state.ts',
    '../features/calendar/components/CalendarView.tsx',
    '../features/calendar/components/CalendarPeekPane.tsx',
    '../features/calendar/components/CalendarEventPeekContent.tsx',
    '../features/calendar/components/CalendarLink.tsx',
    '../features/calendar/components/EventEditor.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(
    calendarSources.join('\n'),
    /(?:from\s+|import\()['"]@\/(?:api\/calendar|stores\/calendar|components\/(?:CalendarLink|EventEditor)|desktop\/Calendar)/,
  )

  for (const file of [
    'api.ts', 'contracts.ts', 'state.ts',
    'components/CanvasView.tsx', 'components/CanvasPreview.tsx', 'components/CanvasFrameContent.tsx',
    'lib/collaboration.ts', 'lib/events.ts', 'lib/realtime.ts',
  ]) {
    await access(new URL(`../features/canvas/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./canvas.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/canvas.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/CanvasView.tsx', import.meta.url)))
  const canvasSources = await Promise.all([
    '../features/canvas/api.ts',
    '../features/canvas/state.ts',
    '../features/canvas/components/CanvasView.tsx',
    '../features/canvas/components/CanvasPreview.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(canvasSources.join('\n'), /api\/canvas|stores\/canvas|components\/Canvas(?:View|Preview|FrameContent)/)

  for (const file of [
    'api.ts', 'contracts.ts', 'state.ts',
    'components/DocumentEditor.tsx', 'components/DocumentLink.tsx',
    'components/DocumentsView.tsx', 'components/DocumentPeekPane.tsx',
  ]) {
    await access(new URL(`../features/documents/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./documents.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/documents.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/DocumentEditor.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../components/DocumentLink.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../desktop/DocumentsView.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../desktop/DocumentPeekPane.tsx', import.meta.url)))
  const documentSources = await Promise.all([
    '../features/documents/api.ts',
    '../features/documents/state.ts',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/documents/components/DocumentLink.tsx',
    '../features/documents/components/DocumentsView.tsx',
    '../features/documents/components/DocumentPeekPane.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(documentSources.join('\n'), /api\/documents|stores\/documents|components\/Document(?:Editor|Link)|desktop\/Document/)

  for (const file of ['api.ts', 'contracts.ts', 'state.ts', 'components/EmailComposer.tsx']) {
    await access(new URL(`../features/email/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./email.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/emailComposer.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/EmailComposer.tsx', import.meta.url)))
  const emailSources = await Promise.all([
    '../features/email/api.ts',
    '../features/email/state.ts',
    '../features/email/components/EmailComposer.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(
    emailSources.join('\n'),
    /(?:from\s+|import\()['"]@\/(?:api\/email|stores\/emailComposer|components\/EmailComposer)/,
  )

  for (const file of ['api.ts', 'contracts.ts', 'store.ts']) {
    await access(new URL(`../features/conversations/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./conversations.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/conversations.ts', import.meta.url)))
  const conversationsState = await readFile(new URL('../features/conversations/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(conversationsState, /stores\/conversations|api\/conversations/)
  assert.match(conversationsState, /error: string \| null/)

  for (const file of [
    'api.ts', 'state/messages.ts', 'state/messageState.ts', 'state/messageStore.ts',
    'state/messageHistory.ts', 'state/messageCommands.ts', 'state/messageRealtime.ts',
    'state/messageReconciliation.ts', 'state/messageProjection.ts', 'state/messageTimeline.ts',
    'state/messagePagination.ts',
    'state/readReceipts.ts', 'state/reactionCommands.ts', 'state/outbox.ts', 'state/reactions.ts',
    'components/ChatComposer.tsx',
    'components/ComposerAttachment.tsx', 'components/ComposerEditor.tsx',
    'components/ComposerEmojiPopover.tsx', 'components/ComposerMenus.tsx',
    'sendComposerMessage.ts', 'useTypingEmitter.ts',
  ]) {
    await access(new URL(`../features/chat/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./messages.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/messages.ts', import.meta.url)))
  const chatStateFiles = [
    'messages.ts', 'messageState.ts', 'messageStore.ts', 'messageHistory.ts',
    'messageCommands.ts', 'messageRealtime.ts', 'messageReconciliation.ts',
    'messageProjection.ts', 'messageTimeline.ts', 'messagePagination.ts', 'readReceipts.ts',
    'reactionCommands.ts', 'reactions.ts', 'outbox.ts',
  ]
  const chatStateSources = await Promise.all(chatStateFiles.map((file) => (
    readFile(new URL(`../features/chat/state/${file}`, import.meta.url), 'utf8')
  )))
  const [messagesFacade, , messageStore, messageHistory, messageCommands, messageRealtime,
    messageReconciliation] = chatStateSources
  assert.doesNotMatch(chatStateSources.join('\n'), /stores\/messages|api\/messages/)
  assert.ok(messagesFacade.length < 2_000, 'messages.ts must remain a public facade')
  assert.ok(chatStateSources.every((source) => source.length < 20_000), 'chat state capabilities must stay bounded')
  assert.match(messageStore, /createMessageHistoryActions/)
  assert.match(messageStore, /selectMessagesFor/)
  assert.match(messageHistory, /lingxiIm\.history\(id, MESSAGES_PAGE_SIZE, oldest\)/)
  assert.match(messageCommands, /lingxiIm\.send\(conversationId, payload\)/)
  assert.match(messageRealtime, /lingxiIm\.subscribe\(reconcileCommittedMessage\)/)
  assert.match(messageReconciliation, /function reconcileCommittedMessage/)
  assert.doesNotMatch(messagesFacade, /create\(|lingxiIm|fromImBatch|withoutFinalizedActiveRuns/)
  const chatApi = await readFile(new URL('../features/chat/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(chatApi, /sendMessage\s*:/)
  const composer = await readFile(new URL('../features/chat/components/ChatComposer.tsx', import.meta.url), 'utf8')
  assert.ok(composer.length < 34_000, 'ChatComposer must remain an orchestration shell')
  assert.match(composer, /<ComposerEditor/)
  assert.match(composer, /<ComposerAttachment/)
  assert.match(composer, /<ComposerEmojiPopover/)
  assert.doesNotMatch(composer, /<RichInput\b|<Attachment\b|function useTypingEmitter|function EmojiPopover/)

  for (const file of ['api.ts', 'contracts.ts', 'state.ts']) {
    await access(new URL(`../features/knowledge/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./knowledge.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/knowledgeSources.ts', import.meta.url)))

  for (const file of ['api.ts', 'contracts.ts', 'components/InvitePeopleModal.tsx', 'components/WorkspaceCreateDialog.tsx']) {
    await access(new URL(`../features/companies/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./companies.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/CompanySwitcher.tsx', import.meta.url)))
  const companySources = await Promise.all([
    '../features/companies/components/InvitePeopleModal.tsx',
    '../features/companies/components/CompanyCourseManagement.tsx',
    '../features/companies/components/InviteAcceptScreen.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(companySources.join('\n'), /api\/companies|components\/InvitePeopleModal/)

  for (const file of [
    'api.ts', 'contracts.ts', 'state.ts',
    'components/BoardsView.tsx', 'components/BoardCardDialog.tsx',
    'components/BoardPeekPane.tsx', 'components/BoardPeekContent.tsx',
  ]) {
    await access(new URL(`../features/boards/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./boards.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/boards.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/ArtifactPeekContent.tsx', import.meta.url)))
  const boardState = await readFile(new URL('../features/boards/state.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(boardState, /api\/boards|stores\/boards/)
  assert.match(boardState, /loadingCommentCardIds: Set<string>/)
  assert.match(boardState, /commentErrors: Record<string, string>/)
  assert.match(boardState, /kind\.startsWith\('comment\.'\)/)
  const boardsView = await readFile(new URL('../features/boards/components/BoardsView.tsx', import.meta.url), 'utf8')
  const boardCardDialog = await readFile(new URL('../features/boards/components/BoardCardDialog.tsx', import.meta.url), 'utf8')
  assert.ok(boardsView.length < 24_000, 'BoardsView must remain a board orchestration shell')
  assert.ok(boardCardDialog.length < 20_000, 'card editing must remain a bounded business composition')
  assert.match(boardsView, /<BoardCardDialog/)
  for (const primitive of ['Dialog', 'Popover', 'Command', 'Button', 'ScrollArea']) {
    assert.match(boardCardDialog, new RegExp(`<${primitive}\\b`), `card editing must compose ${primitive}`)
  }
  assert.doesNotMatch(boardCardDialog, /fixed inset-0|role="listbox"|<button\b|\b(?:ink|cloud|skype|coral)-/)

  for (const file of ['api.ts', 'contracts.ts', 'courseContract.ts', 'components/LearningCenter.tsx']) {
    await access(new URL(`../features/learning/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./learning.ts', import.meta.url)))
  await assert.rejects(access(new URL('./courseContract.ts', import.meta.url)))
  const learningApi = await readFile(new URL('../features/learning/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(learningApi, /listProjects|createProject|openProject|archiveProject/)
  await access(new URL('../features/knowledge/workspace.ts', import.meta.url))
  await assert.rejects(access(new URL('../stores/workspace.ts', import.meta.url)))

  for (const file of ['api.ts', 'contracts.ts', 'state.ts', 'components/AgentEditor.tsx', 'components/AgentsView.tsx']) {
    await access(new URL(`../features/agents/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./agents.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/participants.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/AgentEditor.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../desktop/AgentsView.tsx', import.meta.url)))
  const agentSources = await Promise.all([
    '../features/agents/api.ts',
    '../features/agents/state.ts',
    '../features/agents/components/AgentEditor.tsx',
    '../features/agents/components/AgentsView.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(agentSources.join('\n'), /api\/agents|stores\/participants|components\/AgentEditor|desktop\/AgentsView/)
})
