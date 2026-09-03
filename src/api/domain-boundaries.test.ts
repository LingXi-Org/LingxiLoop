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
    '../features/chat/runtime/index.ts', '../features/conversations/store.ts',
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
    'api.ts', 'runtime/index.ts', 'runtime/model.ts', 'runtime/store.ts',
    'runtime/converter.ts', 'runtime/transport.ts', 'runtime/runtime.tsx',
    'components/ConversationComposer.tsx', 'components/ConversationMessage.tsx',
    'components/ConversationThread.tsx', 'components/ToolRenderers.tsx', 'useTypingEmitter.ts',
  ]) {
    await access(new URL(`../features/chat/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./messages.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/messages.ts', import.meta.url)))
  const chatSources = await Promise.all([
    'runtime/model.ts', 'runtime/store.ts', 'runtime/converter.ts', 'runtime/transport.ts', 'runtime/runtime.tsx',
  ].map((file) => readFile(new URL(`../features/chat/${file}`, import.meta.url), 'utf8')))
  assert.doesNotMatch(chatSources.join('\n'), /stores\/messages|api\/messages|useMessages/)
  assert.match(chatSources[3], /lingxiIm\.history/)
  assert.match(chatSources[3], /lingxiIm\.send/)
  assert.match(chatSources[4], /useExternalStoreRuntime<ThreadMessage>/)
  const chatApi = await readFile(new URL('../features/chat/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(chatApi, /sendMessage\s*:/)
  const composer = await readFile(new URL('../features/chat/components/ConversationComposer.tsx', import.meta.url), 'utf8')
  const lexicalInput = await readFile(new URL('../features/chat/components/ComposerLexicalInput.tsx', import.meta.url), 'utf8')
  assert.match(composer, /ComposerLexicalInput/)
  assert.match(lexicalInput, /LexicalComposerInput/)
  assert.match(composer, /ComposerPrimitive\.Attachments/)
  assert.match(composer, /ComposerPrimitive\.Quote/)

  for (const file of ['api.ts', 'contracts.ts', 'state.ts']) {
    await access(new URL(`../features/knowledge/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./knowledge.ts', import.meta.url)))
  await assert.rejects(access(new URL('../stores/knowledgeSources.ts', import.meta.url)))

  for (const file of ['api.ts', 'contracts.ts', 'components/InvitePeopleModal.tsx']) {
    await access(new URL(`../features/companies/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('./companies.ts', import.meta.url)))
  await assert.rejects(access(new URL('../components/CompanySwitcher.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../features/companies/components/WorkspaceCreateDialog.tsx', import.meta.url)))
  const companySources = await Promise.all([
    '../features/companies/components/InvitePeopleModal.tsx',
    '../features/companies/components/InviteAcceptScreen.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(companySources.join('\n'), /api\/companies|components\/InvitePeopleModal/)

  for (const file of [
    'api.ts',
    'contracts.ts',
    'courseContract.ts',
    'dashboard/LearningDashboardPanel.tsx',
    'dashboard/DashboardSectionFrame.tsx',
    'dashboard/LearnerDashboardSummary.tsx',
    'dashboard/LearnerOverviewDashboard.tsx',
    'dashboard/learnerDashboardModel.ts',
    'dashboard/TeacherDashboardSummary.tsx',
    'dashboard/TeacherLearnersSection.tsx',
  ]) {
    await access(new URL(`../features/learning/${file}`, import.meta.url))
  }
  await assert.rejects(access(new URL('../features/learning/components/LearningCenter.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../features/companies/components/CompanyCourseManagement.tsx', import.meta.url)))
  await assert.rejects(access(new URL('./learning.ts', import.meta.url)))
  await assert.rejects(access(new URL('./courseContract.ts', import.meta.url)))
  const learningApi = await readFile(new URL('../features/learning/api.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(learningApi, /\b(?:listProjects|createProject|openProject|archiveProject)\s*:/)
  await access(new URL('../features/knowledge/workspace.ts', import.meta.url))
  await assert.rejects(access(new URL('../stores/workspace.ts', import.meta.url)))

  for (const file of ['api.ts', 'contracts.ts', 'state.ts', 'components/AgentEditor.tsx']) {
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
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(agentSources.join('\n'), /api\/agents|stores\/participants|components\/AgentEditor|desktop\/AgentsView/)
})
