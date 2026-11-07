import type {ArtifactRichText} from './artifact-document.js'

export interface LinkPreviewRun {text:string;underline:boolean}

/** Navigation keeps decoration, never destinations or an unbounded text tree. */
export function artifactLinkPreview(value:ArtifactRichText|undefined):{richText:ArtifactRichText;lines:LinkPreviewRun[][]}|undefined {
  if(!value)return
  const runs:LinkPreviewRun[]=[]
  let characters=0,visited=0,decorated=false
  const append=(text:string,underline=false)=>{
    text=text.slice(0,512-characters);if(!text||runs.length>=64)return
    characters+=text.length;decorated||=underline
    const previous=runs.at(-1)
    if(previous?.underline===underline)previous.text+=text;else runs.push({text,underline})
  }
  const visit=(node:ArtifactRichText)=>{
    if(++visited>256||characters>=512||runs.length>=64)return
    if(node.type==='text')append(node.text??'',!!node.marks?.some(mark=>mark.type==='underline'||mark.type==='link'&&mark.attrs?.href))
    else if(node.type==='hardBreak')append('\n')
    else{
      for(const child of node.content??[]){if(visited>=256||characters>=512||runs.length>=64)break;visit(child)}
      if(['paragraph','heading','listItem','blockquote'].includes(node.type)&&!runs.at(-1)?.text.endsWith('\n'))append('\n')
    }
  }
  visit(value);if(!decorated)return
  const last=runs.at(-1);if(last){last.text=last.text.replace(/\n+$/,'');if(!last.text)runs.pop()}
  const lines:LinkPreviewRun[][]=[[]]
  outer:for(const run of runs){
    const pieces=run.text.split('\n')
    for(let index=0;index<pieces.length;index++){
      if(index){if(lines.length===4)break outer;lines.push([])}
      const line=lines.at(-1)!,used=line.reduce((length,item)=>length+item.text.length,0),text=pieces[index].slice(0,100-used)
      if(text)line.push({text,underline:run.underline})
    }
    if(lines.length===4&&lines.at(-1)!.reduce((length,item)=>length+item.text.length,0)>=100)break
  }
  return{richText:{type:'doc',content:[{type:'paragraph',content:runs.map(run=>({type:'text',text:run.text,...(run.underline?{marks:[{type:'underline' as const}]}:{})}))}]},lines}
}
