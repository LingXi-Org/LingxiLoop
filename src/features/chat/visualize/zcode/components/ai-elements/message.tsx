import { TextMessagePartProvider, type TextMessagePartComponent } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { TextOffsetContext } from '../../../TextOffsetContext'
export interface MessageResponseProps {
  children: string
  streaming?: boolean
  workspacePath?: string
  workspaceIdentity?: string
  workspaceRemoteSessionId?: string
  sessionId?: string
  sourceMessageId?: string
  textOffset?: number
  Text?: TextMessagePartComponent
}
export function MessageResponse({children,streaming,Text,textOffset}: MessageResponseProps) {
  const status = streaming ? {type:'running' as const} : {type:'complete' as const}
  return <TextOffsetContext.Provider value={textOffset ?? null}><TextMessagePartProvider text={children} isRunning={streaming}>
    {Text ? <Text type="text" text={children} status={status} /> : <MarkdownText agent />}
  </TextMessagePartProvider></TextOffsetContext.Provider>
}
