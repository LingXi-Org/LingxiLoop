import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { useApp } from '@/stores/app'
import type { ConversationSourceSelection } from './contracts'

test('conversation source selection keeps exclusions, rejects inaccessible sources and ignores stale responses', async () => {
  let projectId = 'project'
  let selection: ConversationSourceSelection = { conversationId: 'room', sources: [
    { sourceId: 'enabled', title: 'Enabled', status: 'ready', enabled: true },
    { sourceId: 'excluded', title: 'Excluded', status: 'ready', enabled: false },
  ] }
  const writes: string[][] = []
  let read = async () => selection
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId }) } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [{ id: 'room', kind: 'group' }, { id: 'next', kind: 'direct' }] }) } } })
  mock.module('./api', { namedExports: { knowledgeApi: {
    getConversationSources: () => read(),
    updateConversationSources: async (_id: string, excluded: string[]) => {
      writes.push(excluded)
      selection = { ...selection, sources: selection.sources.map((source) => ({ ...source, enabled: !excluded.includes(source.sourceId) })) }
    },
  } } })
  const { useKnowledgeSources } = await import('./state')
  try {
    useApp.setState({ selectedConversationId: 'room' })
    await useKnowledgeSources.getState().loadConversationSelection('room')
    await useKnowledgeSources.getState().setSourceEnabled('room', 'enabled', false)
    assert.deepEqual(writes, [['excluded', 'enabled']])
    await useKnowledgeSources.getState().setSourceEnabled('room', 'enabled', true)
    assert.deepEqual(writes[1], ['excluded'])
    await assert.rejects(useKnowledgeSources.getState().setSourceEnabled('room', 'private-to-another-user', true), /无法使用/)
    assert.equal(writes.length, 2)

    let finish!: (value: ConversationSourceSelection) => void
    read = () => new Promise((resolve) => { finish = resolve })
    const request = useKnowledgeSources.getState().loadConversationSelection('room')
    projectId = 'different-project'
    useApp.setState({ selectedConversationId: 'next' })
    useKnowledgeSources.getState().reset()
    finish(selection)
    await request
    assert.equal(useKnowledgeSources.getState().conversationSelection, null)
    await assert.rejects(useKnowledgeSources.getState().setSourceEnabled('room', 'enabled', true), /只能管理当前对话/)
  } finally { mock.restoreAll() }
})
