import { type TextMessagePartComponent, type TextMessagePartProps, TextMessagePartProvider, useAuiState } from '@assistant-ui/react'
import { useMemo } from 'react'
import { answerTextOffset } from '@/lib/answerSegment'
import { answerDisplayRunning, answerDisplaySlice } from '@/lib/answerSegmentDisplay'
import { TextOffsetContext } from './TextOffsetContext'
import { legacyVisualizeReferences } from '../../../../shared/retired-visualize'
import { ArchivedVisualizeReferences } from './ArchivedVisualizeReferences'
export function AnswerText({part,Text,readOnly}: {part:TextMessagePartProps;Text:TextMessagePartComponent;readOnly:boolean}) {
  const message = useAuiState(state=>state.message)
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
  const body = slice && (text!==part.text || offset!==textOffset || running!==(part.status.type==='running'))
    ? <TextOffsetContext.Provider value={offset}><TextMessagePartProvider text={text} isRunning={running}><Text {...part} text={text} status={running?{type:'running'}:part.status}/></TextMessagePartProvider></TextOffsetContext.Provider>
    : <Text {...part}/>
  if (message.role !== 'assistant' || running || message.status?.type !== 'complete') return body
  const references = legacyVisualizeReferences(text)
  if (!references.length) return body
  const custom = message.metadata.custom
  const source = typeof custom.sourceMessageId === 'string' ? custom.sourceMessageId
    : typeof custom.imMessageId === 'string' && typeof custom.sequence === 'number' && custom.sequence > 0 ? custom.imMessageId
    : custom.harness ? undefined : message.id
  return <>{body}<ArchivedVisualizeReferences key={JSON.stringify([message.id,source,custom.conversationId])}
    references={references} conversationId={typeof custom.conversationId === 'string' ? custom.conversationId : undefined}
    sourceMessageId={source} readOnly={readOnly} /></>
}
