import type { AgentCapability, Status } from '@/types'

export interface ApiParticipant {
  id: string
  kind: 'agent' | 'human'
  name: string
  role: string | null
  initial: string
  avatarBg: string
  avatarUrl?: string | null
  status: Status
  statusUpdatedAt?: string
  bio: string | null
  tools: string[] | null
  capabilities: AgentCapability[] | null
  systemPrompt?: string | null
  model?: string | null
  email?: string | null
  departedAt?: string | null
}

export interface ApiLearnedMemory {
  agentId: string
  agentName: string
  path: string
  body: string
  meta: {
    kind?: 'fact' | 'preference' | 'instruction' | 'relationship'
    about?: string
    [key: string]: unknown
  }
  updatedAt: string
}

export interface ApiAutonomyRule {
  id: string
  agentId: string
  scope: string
  operation: string
  mode: 'allow' | 'ask' | 'deny'
  source: 'explicit_user' | 'learned'
  createdAt: string
  updatedAt: string
}

export interface AgentInput {
  name?: string
  role?: string
  systemPrompt?: string
  bio?: string
  capabilities?: AgentCapability[]
}

export interface ApiAutonomy {
  userId: string
  agentId: string
  threshold: number
  pulled: number
  led: number
  dissolved: number
}
