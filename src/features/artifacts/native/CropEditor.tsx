import { useRef, useState, type PointerEvent } from 'react'
import type { ArtifactDocument, ArtifactNode } from '../../../../shared/artifact-document'
import type { ArtifactOperation } from '../../../../shared/artifact-operations'
import type { ResizeHandle } from '../../../../shared/artifact-editor-actions'
import { IconButton } from './EditorPrimitives'

export default function CropEditor({ node, pageId, scale, base, onCommit, onClose }: {
  node: ArtifactNode; pageId: string; scale: number; base: ArtifactDocument
  onCommit(operations: ArtifactOperation[], base: ArtifactDocument): void; onClose(): void
}) {
  const [crop, setCrop] = useState(node.crop ?? { x: 0, y: 0, width: 1, height: 1 })
  const start = useRef<{ x: number; y: number; crop: typeof crop; handle: ResizeHandle | 'move' } | null>(null)
  const snapshot = useRef(base)
  const commit = () => { onCommit([{ type: 'node.patch', pageId, nodeId: node.id, patch: { crop } }], snapshot.current); onClose() }
  const down = (event: PointerEvent, handle: ResizeHandle | 'move') => { event.preventDefault(); event.stopPropagation(); start.current = { x: event.clientX, y: event.clientY, crop, handle }; event.currentTarget.setPointerCapture(event.pointerId) }
  const move = (event: PointerEvent) => {
    event.stopPropagation(); const active = start.current; if (!active) return
    const dx = (event.clientX-active.x)/(node.width*scale), dy = (event.clientY-active.y)/(node.height*scale), c=active.crop
    if (active.handle === 'move') { setCrop({...c,x:Math.max(0,Math.min(1-c.width,c.x+dx)),y:Math.max(0,Math.min(1-c.height,c.y+dy))}); return }
    const left=active.handle.includes('w')?Math.max(0,Math.min(c.x+c.width-.01,c.x+dx)):c.x
    const top=active.handle.includes('n')?Math.max(0,Math.min(c.y+c.height-.01,c.y+dy)):c.y
    const right=active.handle.includes('e')?Math.max(c.x+.01,Math.min(1,c.x+c.width+dx)):c.x+c.width
    const bottom=active.handle.includes('s')?Math.max(c.y+.01,Math.min(1,c.y+c.height+dy)):c.y+c.height
    setCrop({x:left,y:top,width:right-left,height:bottom-top})
  }
  return <div className="native-crop-editor" role="group" aria-label="图片裁剪" tabIndex={0} onKeyDown={e => {
    e.stopPropagation()
    if (e.key==='Escape') { e.preventDefault();onClose() }
    if (e.key==='Enter') { e.preventDefault();commit() }
    const step=e.shiftKey?.01:.001
    if (e.key.startsWith('Arrow')) { e.preventDefault();setCrop(c=>({...c,x:Math.max(0,Math.min(1-c.width,c.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),y:Math.max(0,Math.min(1-c.height,c.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)))})) }
  }} style={{left:node.x,top:node.y,width:node.width,height:node.height,transform:`rotate(${node.rotation}deg)`}}>
    <div className="native-crop-shade" />
    <div className="native-crop-region" style={{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.width*100}%`,height:`${crop.height*100}%`}} onPointerDown={e=>down(e,'move')} onPointerMove={move} onPointerUp={e=>{e.stopPropagation();start.current=null}} onPointerCancel={()=>{start.current=null}}>
      {(['nw','n','ne','e','se','s','sw','w'] as const).map(handle=><button key={handle} type="button" className={`native-resize-handle native-handle-${handle}`} style={{width:8/scale,height:8/scale}} aria-label={`裁剪边缘 ${handle}`} onPointerDown={e=>down(e,handle)} onPointerMove={move} onPointerUp={e=>{e.stopPropagation();start.current=null}} />)}
    </div>
    <div className="native-crop-toolbar" style={{transform:`scale(${1/scale})`}}><IconButton icon="check" label="完成裁剪" onClick={commit} /><IconButton icon="undo" label="移除裁剪" onClick={()=>{onCommit([{type:'node.patch',pageId,nodeId:node.id,patch:{},unset:['crop']}],snapshot.current);onClose()}} /><IconButton icon="close" label="取消裁剪" onClick={onClose} /></div>
  </div>
}
