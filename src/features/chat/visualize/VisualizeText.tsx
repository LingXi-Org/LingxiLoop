import { useAuiState, type TextMessagePartComponent, type TextMessagePartProps } from '@assistant-ui/react'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId } from '@/stores/auth'
import { activityAnnotation } from '@/lib/runActivity'
import { GenUiMessageResponse } from './zcode/gen-ui/components/GenUiMessageResponse'
import { StreamingPart } from '@/components/assistant-ui/streaming-tail'
export function VisualizeText({part,Text,readOnly}: {part:TextMessagePartProps;Text:TextMessagePartComponent;readOnly:boolean}) {
  const message = useAuiState(state=>state.message)
  const partKey = useAuiState(state=>JSON.stringify([state.message.id,
    activityAnnotation(state.part)?.id ?? state.message.parts.indexOf(state.part)]))
  const textOffset = useAuiState(state=>state.message.parts.slice(0,state.message.parts.indexOf(state.part)).reduce((offset,item)=>offset+(item.type==='text' && activityAnnotation(item)?.kind!=='commentary' ? item.text.length+1 : 0),0))
  if(message.role!=='assistant' || !/::|/.test(part.text)) return <Text {...part}/>
  const workspace = getWorkspaceSession()
  const conversationId = message.metadata.custom.conversationId
  const source = message.metadata.custom.sourceMessageId
  return <StreamingPart key={partKey}><GenUiMessageResponse completed={message.status?.type==='complete'} streaming={message.status?.type==='running'}
    messageKey={message.id} workspacePath={readOnly ? undefined : workspace?.projectId} workspaceIdentity={getActiveCompanyId() ?? undefined}
    sessionId={typeof conversationId==='string' ? conversationId : undefined} sourceMessageId={typeof source==='string' ? source : message.id}
    Text={Text} textOffset={textOffset}>{part.text}</GenUiMessageResponse></StreamingPart>
}
