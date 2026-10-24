/** Timing qualification only: pending replacement text is not visible before
 * commit. Native code still owns the authoritative final source collection. */
export function retainedAppendText(sources: readonly {partId:string}[], parts: ReadonlyMap<string,{text:string;operation:string}>) {
  return sources.map(source=>{
    const part=parts.get(source.partId)
    return part?.operation==='append' ? part.text : ''
  }).join('')
}
