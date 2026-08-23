import type { LingxiMessageV1 } from '../agent-os/types.js'

export const WUKONG_CHANNEL_TYPE_PERSON = 1
export const WUKONG_CHANNEL_TYPE_GROUP = 2

export interface ImBootstrap {
  uid: string
  token: string
  wsUrl: string
  apiVersion: 3
  sdkVersion: '1.3.5'
}

export interface ImChannelProfile {
  channelId: string
  channelType: 1 | 2
  kind?: 'direct' | 'group'
  title: string
  members: string[]
  leaderAgentId?: string
  presetKey?: string
}

export interface ImMessage {
  messageId: string
  messageSeq: number
  clientMsgNo: string
  channelId: string
  channelType: number
  fromUid: string
  timestamp: number
  payload: LingxiMessageV1
}

export interface WukongWebhookMessage {
  eventId: string
  eventType: string
  message: ImMessage
}
