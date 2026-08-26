/**
 * Local development bootstrap for the production learning product surface.
 * Fixture content lives in mockLearningImFixtures; Canvas behavior lives in
 * mockLearningCanvas so this coordinator only performs the atomic store swap.
 */
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/stores/conversations'
import { useMessages, VIRTUOSO_FIRST_INDEX_BASE } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import { seedMockLearningCanvas } from './mockLearningCanvas'
import {
  learningConversations,
  learningMessages,
  learningParticipants,
  learningReadReceipts,
  learningTyping,
  MOCK_TOOL_GALLERY_ROOM_ID,
  MOCK_USER_ID,
} from './mockLearningImFixtures'

export function activateMockWorkspace(_projectId?: string): void {
  useConversations.setState({ list: learningConversations, loaded: true })
  useMessages.setState({
    byConvo: learningMessages,
    streaming: {},
    typing: learningTyping,
    loaded: new Set(learningConversations.map((conversation) => conversation.id)),
    loading: new Set(),
    hasMoreOlder: Object.fromEntries(learningConversations.map((conversation) => [conversation.id, false])),
    loadingOlder: new Set(),
    firstItemIndex: Object.fromEntries(learningConversations.map((conversation) => [conversation.id, VIRTUOSO_FIRST_INDEX_BASE])),
    errors: {},
    readReceipts: learningReadReceipts,
  })
  seedMockLearningCanvas()
  useApp.getState().selectConversation(MOCK_TOOL_GALLERY_ROOM_ID)
}

export function seedMockIm(): void {
  if (useAuth.getState().user?.id === MOCK_USER_ID && useConversations.getState().loaded) return

  useAuth.setState({
    token: 'local-mock-token',
    user: { id: MOCK_USER_ID, name: '林曦', email: 'dev@localhost', emailVerified: true },
    companies: [{ id: 'mock-workspace', name: 'LingxiLoop 本地学习空间', slug: 'local-learning', role: 'owner', tier: 'max' }],
    activeCompanyId: 'mock-workspace',
    ready: true,
    serverCapabilities: null,
  })
  useParticipants.setState({
    byId: Object.fromEntries(learningParticipants.map((participant) => [participant.id, participant])),
    loaded: true,
  })
  activateMockWorkspace()
}
