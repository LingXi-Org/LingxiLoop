// Synthetic API; real product dialog, HTTP client and scoped stores. No provider calls.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationMembersButton } from '../../../src/features/conversations/components/ConversationMembersDialog'
import { useAuth } from '../../../src/stores/auth'
import { ws } from '../../../src/api/core/realtime'
import type { WsEvent } from '../../../src/api/contracts'
import { bootConversations, useConversations } from '../../../src/features/conversations/store'
import { setWorkspaceSession } from '../../../src/lib/workspaceSession'
import '../../../src/styles/globals.css'

const mode = new URLSearchParams(location.search).get('mode') ?? 'manager'
const people = [
  { id: 'student', kind: 'human', name: '学生小林', departed_at: null },
  { id: 'peer', kind: 'human', name: '学生小陈', departed_at: null },
  { id: 'reviewer', kind: 'agent', name: '溯源', departed_at: null },
  { id: 'teacher', kind: 'human', name: '张老师', departed_at: null },
]
let members = ['student', 'peer'], version = 0
const operations: string[] = []
const conversation = { id: 'staged-room', kind: 'group' as const, title: 'T16 分阶段协作', members, unread: 0 }
useAuth.setState({ user: { id: 'student' } as never, activeCompanyId: 'fixture-company', authenticated: true, ready: true })
setWorkspaceSession({ companyId: 'fixture-company', projectId: 'fixture-course' })
useConversations.setState({ list: [conversation], loaded: true, projectId: 'fixture-course' })
const realFetch = window.fetch
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? 'GET'
  if (!url.startsWith('/api/')) return realFetch(input, init)
  let value: unknown
  if (url.includes('/members')) {
    if (method !== 'GET') {
      if (mode !== 'manager') return Response.json({ error: 'denied' }, { status: 403 })
      const id = method === 'DELETE' ? url.split('/').at(-1)! : JSON.parse(String(init?.body)).id
      operations.push(`${method}:${id}`)
      members = method === 'DELETE' ? members.filter(member => member !== id) : [...new Set([...members, id])]
      version++
      value = { ok: true, members }
    } else value = { members: people.filter(p => members.includes(p.id)),
      candidates: mode === 'manager' ? people.filter(p => !members.includes(p.id)) : [],
      canManage: mode === 'manager', restriction: mode === 'managed' ? 'managed_context' : mode === 'denied' ? 'manager_required' : null,
      historyVisibility: 'shared_conversation', version }
  } else if (url === '/api/im/channels') value = members.includes('student') ? [{ ...conversation, members, subtitle: null, leaderId: null, pinned: false, muted: false,
    topic: null, tag: null, pulledBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastMessage: null, unreadCount: 0 }] : []
  else value = []
  return Response.json(value)
}) as typeof fetch
let receive: ((event: WsEvent) => void) | undefined
ws.connect = async () => undefined
ws.on = handler => { receive = handler; return () => { receive = undefined } }
bootConversations(false)
Object.assign(window, { fixture: () => ({ members, version, operations, listMembers: useConversations.getState().list[0]?.members ?? [] }),
  remoteMembers: (next: string[]) => { members = next; receive?.({ type: 'conversation.updated', conversationId: conversation.id, patch: { membershipChanged: true } } as WsEvent) } })
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-background p-5 text-foreground"><h1>T16 分阶段协作</h1><p>原始学生分析记录保留</p><ConversationMembersButton conversation={conversation} /></main>)
