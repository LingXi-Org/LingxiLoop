import type {ArtifactNode} from '../../../../shared/artifact-document'

export interface ElementPositionPins{
  bothX:boolean;bothY:boolean;useRight:boolean;useBottom:boolean
  left:number;right:number;top:number;bottom:number;boxWidth?:number;boxHeight?:number
}
export function readElementPositionPins(element:HTMLElement):ElementPositionPins|null{
  const style=getComputedStyle(element)
  if(style.position!=='absolute'&&style.position!=='fixed')return null
  const typed=(element as HTMLElement&{computedStyleMap?():{get(name:string):unknown}}).computedStyleMap?.()
  const set=(name:string)=>{const value=String(typed?.get(name)??element.style.getPropertyValue(name)).trim();return value!==''&&value!=='auto'}
  const left=set('left'),right=set('right'),top=set('top'),bottom=set('bottom')
  const number=(value:string)=>Number.parseFloat(value)||0
  return{boxWidth:style.boxSizing==='border-box'?0:number(style.paddingLeft)+number(style.paddingRight)+number(style.borderLeftWidth)+number(style.borderRightWidth),boxHeight:style.boxSizing==='border-box'?0:number(style.paddingTop)+number(style.paddingBottom)+number(style.borderTopWidth)+number(style.borderBottomWidth),bothX:left&&right,bothY:top&&bottom,useRight:right&&!left,useBottom:bottom&&!top,left:number(style.left),right:number(style.right),top:number(style.top),bottom:number(style.bottom)}
}
export function elementMoveValues(pins:ElementPositionPins,dx:number,dy:number){
  const values:Partial<Record<'left'|'right'|'top'|'bottom',number>>={}
  if(!pins.bothX)values[pins.useRight?'right':'left']=Math.round(pins.useRight?pins.right-dx:pins.left+dx)
  if(!pins.bothY)values[pins.useBottom?'bottom':'top']=Math.round(pins.useBottom?pins.bottom-dy:pins.top+dy)
  return values
}
export function elementMovePatch(node:ArtifactNode,pins:ElementPositionPins,dx:number,dy:number):Partial<ArtifactNode>{
  const patch:Partial<ArtifactNode>={},css={...node.css},values=elementMoveValues(pins,dx,dy)
  const value=(name:string,number:number)=>`${number}px${/!important\s*$/i.test(css[name]??'')?' !important':''}`
  if(values.left!==undefined){if(values.left!==node.x)patch.x=values.left;if(Object.hasOwn(css,'left')||values.left!==node.x)css.left=value('left',values.left);delete css.right}
  if(values.top!==undefined){if(values.top!==node.y)patch.y=values.top;if(Object.hasOwn(css,'top')||values.top!==node.y)css.top=value('top',values.top);delete css.bottom}
  if(values.right!==undefined){css.right=value('right',values.right);css.left='auto'}
  if(values.bottom!==undefined){css.bottom=value('bottom',values.bottom);css.top='auto'}
  if(JSON.stringify(css)!==JSON.stringify(node.css??{}))patch.css=css
  return patch
}

/** Resize uses the authored inset, not a margin-adjusted selection rectangle. */
export function elementResizePatch(node:ArtifactNode,pins:ElementPositionPins,painted:ArtifactNode,resized:ArtifactNode,handle:string):Partial<ArtifactNode>{
  const patch:Partial<ArtifactNode>={},css={...node.css}
  const put=(name:string,number:number)=>{css[name]=`${number}px${/!important\s*$/i.test(css[name]??'')?' !important':''}`}
  if(/[ew]/.test(handle)){
    const width=Math.max(0,Math.round(resized.width-(pins.boxWidth??0)));if(width>0)patch.width=width;put('width',width)
    if(pins.useRight){if(handle.includes('e'))put('right',Math.round(pins.right-(resized.x-painted.x)-(resized.width-painted.width)))}
    else if(handle.includes('w')){patch.x=Math.round(pins.left+resized.x-painted.x);put('left',patch.x)}
  }
  if(/[ns]/.test(handle)){
    const height=Math.max(0,Math.round(resized.height-(pins.boxHeight??0)));if(height>0)patch.height=height;put('height',height)
    if(pins.useBottom){if(handle.includes('s'))put('bottom',Math.round(pins.bottom-(resized.y-painted.y)-(resized.height-painted.height)))}
    else if(handle.includes('n')){patch.y=Math.round(pins.top+resized.y-painted.y);put('top',patch.y)}
  }
  if(resized.points)patch.points=resized.points
  if(JSON.stringify(css)!==JSON.stringify(node.css??{}))patch.css=css
  return patch
}

/** Keyboard nudges retain both centering anchors; drag locks are gesture-only. */
export function elementNudgePatch(node:ArtifactNode,pins:ElementPositionPins,dx:number,dy:number):Partial<ArtifactNode>{
 const patch:Partial<ArtifactNode>={},css={...node.css}
 const put=(name:string,value:number)=>{css[name]=`${value}px${/!important\s*$/i.test(css[name]??'')?' !important':''}`}
 if(dx){if(pins.useRight){put('right',Math.round(pins.right-dx));css.left='auto'}else{patch.x=Math.round(pins.left+dx);put('left',patch.x)}}
 if(dy){if(pins.useBottom){put('bottom',Math.round(pins.bottom-dy));css.top='auto'}else{patch.y=Math.round(pins.top+dy);put('top',patch.y)}}
 if(JSON.stringify(css)!==JSON.stringify(node.css??{}))patch.css=css
 return patch
}
