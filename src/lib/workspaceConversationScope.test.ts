import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('switching workspaces reloads the complete project-scoped conversation surface', async () => {
  const [workspace, conversations, participants, documents, calendar, transport] = await Promise.all([
    read('../features/knowledge/workspace.ts'),
    read('../features/conversations/store.ts'),
    read('../features/agents/state.ts'),
    read('../features/documents/state.ts'),
    read('../features/calendar/state.ts'),
    read('../api/core/http.ts'),
  ])

  assert.match(workspace, /setWorkspaceSession\(\{ companyId, projectId \}\)[\s\S]*selectConversation\(null\)[\s\S]*useConversations\.getState\(\)\.load\(\)/)
  assert.match(workspace, /selectLearningSpace[\s\S]*list\.some\(\(workspace\) => workspace\.id === selection\.projectId\)[\s\S]*useWorkspace\.getState\(\)\.load\(\)[\s\S]*select\(selection\.projectId\)/)
  assert.match(workspace, /selectLearningSpace[\s\S]*setWorkspaceSession\(selection\)[\s\S]*useWorkspace\.getState\(\)\.reset\(\)[\s\S]*useParticipants\.getState\(\)\.reset\(\)[\s\S]*useConversations\.getState\(\)\.reset\(\)[\s\S]*useCalendar\.getState\(\)\.reset\(\)[\s\S]*useDocuments\.getState\(\)\.reset\(\)[\s\S]*setActiveCompany\(selection\.companyId\)/)
  assert.match(conversations, /const workspace = getWorkspaceSession\(\)[\s\S]*const epoch = \+\+requestEpoch/)
  assert.match(conversations, /activeWorkspace\?\.companyId !== workspace\?\.companyId[\s\S]*activeWorkspace\?\.projectId !== projectId/)
  assert.match(conversations, /reconcileConversationSelection\(conversations\)/)
  assert.match(participants, /reset\(\)[\s\S]*participantsRequestEpoch \+= 1[\s\S]*set\(\{ byId: \{\}, loaded: false \}\)/)
  assert.match(documents, /documentsRequestEpoch[\s\S]*scope !== activeScopeKey\(\)[\s\S]*reset: \(\) => \{[\s\S]*documentsRequestEpoch \+= 1/)
  assert.match(calendar, /calendarRequestEpoch[\s\S]*scope !== activeScopeKey\(\)[\s\S]*reset\(\)[\s\S]*calendarRequestEpoch \+= 1/)
  assert.match(transport, /headers\['x-project-id'\] = workspace\.projectId/)
})
