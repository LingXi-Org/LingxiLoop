/** Inert, bounded local pen commands; no CSS, markup, relative commands or arcs. */
export function isArtifactPenPath(value:string):boolean {
  if(!value||value.length>24000||value[0]!=='M')return false
  let at=0,commands=0
  const number=/\d+(?:\.\d+)?/y
  while(at<value.length){
    while(value[at]===' ')at++
    if(at===value.length)return commands>1
    const command=value[at++],count=command==='C'?6:command==='M'||command==='L'?2:0
    if(!count)return false
    for(let i=0;i<count;i++){
      const before=at
      while(value[at]===' ')at++
      if(i>0&&value[at]===','){at++;while(value[at]===' ')at++}
      if(i>0&&at===before)return false
      number.lastIndex=at;const token=number.exec(value)
      if(!token||!Number.isFinite(Number(token[0]))||Number(token[0])>8000)return false
      at=number.lastIndex
    }
    commands++
  }
  return commands>1
}
