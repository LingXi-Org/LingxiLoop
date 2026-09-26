import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import type { LearningSpace } from '@/features/learning/contracts'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'

test('workspace navigation preserves views and restores the original conversation after a failed switch', async () => {
  let workspace = { companyId: 'company', selectedId: 'old' as string | null }
  const selected: string[] = []
  const failing = new Set<string>()
  mock.module('@/features/knowledge/workspace', { namedExports: {
    useWorkspace: { getState: () => ({ ...workspace, leave: () => { workspace.selectedId = null; useApp.getState().selectConversation(null) } }) },
    selectLearningSpace: async ({ projectId }: { projectId: string }) => {
      selected.push(projectId)
      workspace = { ...workspace, selectedId: projectId }
      useApp.getState().selectConversation(null)
      if (failing.has(projectId)) throw new Error('switch failed')
    },
  } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [{ id: 'room' }] }) } } })
  const { switchLearningWorkspace } = await import('./dashboardScope')
  const target = { companyId: 'company', projectId: 'next', perspective: 'teacher', canManage: true, courseId: 'course' } as LearningSpace
  try {
    useApp.setState({ view: 'calendar', selectedConversationId: 'room' })
    useSurface.getState().openCanvasPeek('canvas')
    useApp.setState({ view: 'calendar' })
    await switchLearningWorkspace(target)
    assert.equal(useApp.getState().view, 'calendar')
    assert.equal(useSurface.getState().surface, null)
    assert.equal(workspace.selectedId, 'next')
    await switchLearningWorkspace(target)
    assert.deepEqual(selected, ['next'])

    useApp.setState({ view: 'course-content' })
    await switchLearningWorkspace({ ...target, projectId: 'learner', perspective: 'learner', canManage: false })
    assert.equal(useApp.getState().view, 'learning')

    workspace.selectedId = 'old'
    useApp.setState({ view: 'library', selectedConversationId: 'room' })
    failing.add('next')
    await assert.rejects(switchLearningWorkspace(target), /switch failed/)
    assert.deepEqual({ workspace: workspace.selectedId, view: useApp.getState().view, conversation: useApp.getState().selectedConversationId }, { workspace: 'old', view: 'library', conversation: 'room' })
    failing.add('old')
    await assert.rejects(switchLearningWorkspace(target), /原工作区也暂时不可用/)
    assert.equal(workspace.selectedId, null)
    assert.equal(useApp.getState().selectedConversationId, null)
  } finally { mock.restoreAll() }
})
