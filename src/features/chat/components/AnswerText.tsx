import { retiredVisualizationRanges } from '@/lib/retired-visualizations'
import { type TextMessagePartComponent, type TextMessagePartProps, TextMessagePartProvider, useAuiState } from '@assistant-ui/react'
import { Fragment, useMemo } from 'react'
import { answerTextOffset } from '@/lib/answerSegment'
import { answerDisplayRunning, answerDisplaySlice } from '@/lib/answerSegmentDisplay'
import { TextOffsetContext } from '@/components/assistant-ui/text-offset-context'
export function AnswerText({part,Text}: {part:TextMessagePartProps;Text:TextMessagePartComponent}) {
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
  const ranges = message.role === 'assistant' ? retiredVisualizationRanges(text) : []
  const render = (start: number, end: number) => start < end && <TextOffsetContext.Provider value={offset + start}>
    <TextMessagePartProvider text={text.slice(start,end)} isRunning={running}>
      <Text {...part} text={text.slice(start,end)} status={running ? {type:'running'} : part.status} />
    </TextMessagePartProvider>
  </TextOffsetContext.Provider>
  if (!ranges.length) return text === part.text && offset === textOffset && running === (part.status.type === 'running')
    ? <Text {...part} /> : render(0,text.length)
  let cursor = 0
  return <>{ranges.map(({start,end}) => {
    const before = render(cursor,start)
    cursor = end
    return <Fragment key={start}>{before}<p role="note" className="retired-visualization text-sm text-muted-foreground">此可视化功能已下线。</p></Fragment>
  })}{render(cursor,text.length)}</>
}
