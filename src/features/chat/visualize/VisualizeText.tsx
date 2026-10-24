import { type TextMessagePartComponent, type TextMessagePartProps, TextMessagePartProvider, useAuiState } from '@assistant-ui/react'
import { useMemo } from 'react'
import { StreamingPart } from '@/components/assistant-ui/streaming-tail'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { answerTextOffset } from '@/lib/answerSegment'
import { answerDisplayRunning, answerDisplaySlice } from '@/lib/answerSegmentDisplay'
import { activityAnnotation } from '@/lib/runActivity'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId } from '@/stores/auth'
import { TextOffsetContext } from './TextOffsetContext'
import { GenUiMessageResponse } from './zcode/gen-ui/components/GenUiMessageResponse'
export function VisualizeText({part,Text,readOnly}: {part:TextMessagePartProps;Text:TextMessagePartComponent;readOnly:boolean}) {
  const message = useAuiState(state=>state.message)
  const partKey = useAuiState(state=>JSON.stringify([state.message.id,
    (state.message.metadata.custom.harness as RunDisplayState | undefined)?.requestVersion ?? null,
    state.message.metadata.custom.conversationId,
    activityAnnotation(state.part)?.id ?? state.message.parts.indexOf(state.part)]))
  const textOffset = useAuiState(state=>answerTextOffset(state.message.parts,state.message.parts.indexOf(state.part)))
  const partIndex = useAuiState(state=>state.message.parts.indexOf(state.part))
  const slice = useMemo(()=>{
    const claims = message.content.find(item=>item.type==='data' && item.name==='citation-claims')
    const ranges = claims?.type==='data' && claims.data && typeof claims.data==='object' && 'claims' in claims.data && Array.isArray(claims.data.claims)
      ? claims.data.claims.filter((value: unknown): value is {start:number;end:number}=>!!value && typeof value==='object' && typeof Reflect.get(value,'start')==='number' && typeof Reflect.get(value,'end')==='number') : []
    const display=answerDisplaySlice(message.parts,partIndex,ranges)
    return display ? {...display,running:answerDisplayRunning(message.parts,partIndex,display)} : undefined
  },[message.parts,message.content,partIndex])
  const text = slice?.text ?? part.text, offset = slice?.offset ?? textOffset
  const running=part.status.type==='running' || slice?.running===true
  if (!text) return null
  if(message.role!=='assistant' || !/::|/.test(text)) return slice && (text!==part.text || offset!==textOffset || running!==(part.status.type==='running'))
    ? <TextOffsetContext.Provider value={offset}><TextMessagePartProvider text={text} isRunning={running}><Text {...part} text={text} status={running?{type:'running'}:part.status}/></TextMessagePartProvider></TextOffsetContext.Provider>
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
