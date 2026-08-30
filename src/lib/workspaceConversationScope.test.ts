import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('switching workspaces reloads the complete project-scoped conversation surface', async () => {
  const [workspace, conversations, transport] = await Promise.all([
    read('../features/knowledge/workspace.ts'),
    read('../features/conversations/store.ts'),
    read('../api/core/http.ts'),
  ])

  assert.match(workspace, /setWorkspaceSession\(\{ companyId, projectId \}\)[\s\S]*selectConversation\(null\)[\s\S]*useConversations\.getState\(\)\.load\(\)/)
  assert.match(conversations, /const projectId = getWorkspaceSession\(\)\?\.projectId \?\? null/)
  assert.match(conversations, /epoch !== requestEpoch \|\| getWorkspaceSession\(\)\?\.projectId !== projectId/)
  assert.match(conversations, /reconcileConversationSelection\(conversations\)/)
  assert.match(transport, /headers\['x-project-id'\] = workspace\.projectId/)
})
