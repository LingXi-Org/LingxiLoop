import { useAuiState, TextMessagePartProvider, type TextMessagePartComponent, type TextMessagePartProps } from '@assistant-ui/react'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId } from '@/stores/auth'
import { activityAnnotation } from '@/lib/runActivity'
import { answerTextOffset } from '@/lib/answerSegment'
import { answerDisplaySlice } from '@/lib/answerSegmentDisplay'
import { TextOffsetContext } from './TextOffsetContext'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { GenUiMessageResponse } from './zcode/gen-ui/components/GenUiMessageResponse'
import { StreamingPart } from '@/components/assistant-ui/streaming-tail'
export function VisualizeText({part,Text,readOnly}: {part:TextMessagePartProps;Text:TextMessagePartComponent;readOnly:boolean}) {
  const message = useAuiState(state=>state.message)
  const partKey = useAuiState(state=>JSON.stringify([state.message.id,
    (state.message.metadata.custom.harness as RunDisplayState | undefined)?.requestVersion ?? null,
    state.message.metadata.custom.conversationId,
    activityAnnotation(state.part)?.id ?? state.message.parts.indexOf(state.part)]))
  const textOffset = useAuiState(state=>answerTextOffset(state.message.parts,state.message.parts.indexOf(state.part)))
  const slice = useAuiState(state=>{
    const claims = state.message.content.find(item=>item.type==='data' && item.name==='citation-claims')
    const ranges = claims?.type==='data' && claims.data && typeof claims.data==='object' && 'claims' in claims.data && Array.isArray(claims.data.claims)
      ? claims.data.claims.filter((value): value is {start:number;end:number}=>!!value && typeof value==='object' && typeof Reflect.get(value,'start')==='number' && typeof Reflect.get(value,'end')==='number') : []
    return answerDisplaySlice(state.message.parts,state.message.parts.indexOf(state.part),ranges)
  })
  const text = slice?.text ?? part.text, offset = slice?.offset ?? textOffset
  if (!text) return null
  if(message.role!=='assistant' || !/::|/.test(text)) return slice && (text!==part.text || offset!==textOffset)
    ? <TextOffsetContext.Provider value={offset}><TextMessagePartProvider text={text} isRunning={part.status.type==='running'}><Text {...part} text={text}/></TextMessagePartProvider></TextOffsetContext.Provider>
    : <Text {...part}/>
  const workspace = getWorkspaceSession()
  const conversationId = message.metadata.custom.conversationId
  const custom = message.metadata.custom
  const source = typeof custom.sourceMessageId === 'string' ? custom.sourceMessageId
    : typeof custom.imMessageId === 'string' && typeof custom.sequence === 'number' && custom.sequence > 0 ? custom.imMessageId
    : custom.harness ? undefined : message.id
  return <StreamingPart key={partKey}><GenUiMessageResponse completed={message.status?.type==='complete'} streaming={message.status?.type==='running'}
    awaitingDelivery={message.status?.type==='complete' && !source}
    messageKey={message.id} workspacePath={readOnly ? undefined : workspace?.projectId} workspaceIdentity={getActiveCompanyId() ?? undefined}
    sessionId={typeof conversationId==='string' ? conversationId : undefined} sourceMessageId={source}
    Text={Text} textOffset={offset}>{text}</GenUiMessageResponse></StreamingPart>
}
