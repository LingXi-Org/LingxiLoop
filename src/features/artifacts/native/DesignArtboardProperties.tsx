import {useState} from 'react'
import {RadioGroup} from '@base-ui/react/radio-group'
import {Radio} from '@base-ui/react/radio'
import type {ArtifactDocument,ArtifactPage} from '../../../../shared/artifact-document'
import type {ArtifactOperation} from '../../../../shared/artifact-operations'
import {normalizePageRadius,pageRadiusCorners} from '../../../../shared/artifact-page-radius'
import {artifactPrintMode} from '../../../../shared/artifact-page-print'
import {artifactPageBackground} from '../../../../shared/artifact-themes'
import Field from './InspectorField'
import {IconButton,Menu,MenuItem} from './EditorPrimitives'

function ArtboardRadius({page,onChange}:{page:ArtifactPage;onChange(value:ArtifactPage['radius']):void}){
  const [cornersOpen,setCornersOpen]=useState(false),corners=pageRadiusCorners(normalizePageRadius(page.radius)),mixed=!corners.every(value=>value===corners[0])
  const change=(value:string,index?:number)=>{
    if(!value.trim())return
    const number=Number(value);if(!Number.isFinite(number))return
    if(index===undefined)onChange(normalizePageRadius(number))
    else{const next=[...corners];next[index]=number;onChange(normalizePageRadius(next))}
  }
  return <div className="native-artboard-radius"><div className="native-artboard-radius-main"><Field label="圆角" unit type="number" min={0} max={4000} value={mixed?'':corners[0]} placeholder={mixed?'混合':undefined} onChange={value=>change(value)}/><IconButton icon="frame" label="分别设置圆角" active={cornersOpen} onClick={()=>setCornersOpen(value=>!value)}/></div>{cornersOpen&&<div className="native-artboard-radius-corners">{([['左上圆角',0],['右上圆角',1],['左下圆角',3],['右下圆角',2]]as const).map(([label,index])=><Field key={index} label={label} unit type="number" min={0} max={4000} value={corners[index]} onChange={value=>change(value,index)}/>)}</div>}</div>
}

export default function DesignArtboardProperties({document,page,dispatch,fitHeight,writable}:{document:ArtifactDocument;page:ArtifactPage;dispatch(operations:ArtifactOperation[]):void;fitHeight():void;writable:boolean}){
  const patch=(value:Extract<ArtifactOperation,{type:'page.patch'}>['patch'],unset?:Extract<ArtifactOperation,{type:'page.patch'}>['unset'])=>dispatch([{type:'page.patch',pageId:page.id,patch:value,...(unset?{unset}:{})}])
  const size=(axis:'width'|'height',value:string)=>{const number=Number(value);if(value.trim()&&Number.isFinite(number))patch({[axis]:Math.max(120,Math.min(8000,number))})}
  const mode=artifactPrintMode(page)
  return <div className="native-artboard-properties">
    <section className="native-property-section native-artboard-size"><h3>画板</h3><div className="native-artboard-section-body">
      <Field label="宽度" inputLabel="画板宽度" type="number" unit min={120} max={8000} value={page.width} onChange={value=>size('width',value)}/>
      <div className="native-artboard-height"><Field label="高度" inputLabel="画板高度" type="number" unit min={120} max={8000} value={page.height} onChange={value=>size('height',value)}/><Menu icon="more" label="高度操作" disabled={!writable} popupRole="menu" minimumWidth={180} align="end"><MenuItem role="menuitem" onClick={fitHeight}>适应内容高度</MenuItem></Menu></div>
      <div className="native-artboard-radio-row"><span>打印模式</span><RadioGroup aria-label="打印模式" disabled={!writable} value={mode} onValueChange={value=>patch({print:value as 'flow'|'fixed'})}><Radio.Root value="flow">流式</Radio.Root><Radio.Root value="fixed">固定</Radio.Root></RadioGroup></div>
      <div className="native-artboard-radio-row"><span>纸张</span><RadioGroup aria-label="打印纸张" value={page.paper==='A4'||page.paper==='Letter'?page.paper:null} disabled={!writable||mode!=='flow'} onValueChange={value=>{if(value)patch({paper:value as 'A4'|'Letter'})}}><Radio.Root value="Letter">美式信纸</Radio.Root><Radio.Root value="A4">A4</Radio.Root></RadioGroup></div>
    </div></section>
    <section className="native-property-section native-artboard-appearance"><h3>外观</h3><div className="native-artboard-section-body">
      <Field label="背景" type="color" value={artifactPageBackground(page,document)} onChange={value=>patch({background:value==='none'?'transparent':value},['themeBackground'])}/>
      <ArtboardRadius key={page.id} page={page} onChange={radius=>patch(radius===undefined?{}:{radius},radius===undefined?['radius']:undefined)}/>
    </div></section>
    <section className="native-artboard-guides"><header><h3>布局参考线</h3><Menu icon="plus" label="添加布局参考线" popupRole="menu" minimumWidth={180} disabled={!writable||(page.layoutGuides?.length??0)>=6} align="end">{(['columns','rows','grid'] as const).map(kind=><MenuItem role="menuitem" key={kind} onClick={()=>patch({layoutGuides:[...(page.layoutGuides??[]),{kind,count:12,size:8,gutter:24,margin:80,color:'#ef44441a'}]})}>{({columns:'列',rows:'行',grid:'网格'})[kind]}</MenuItem>)}</Menu></header>
      {(page.layoutGuides??[]).map((guide,index)=><div className="native-guide-settings" key={index}><label className="native-field"><span>类型</span><select aria-label={`参考线 ${index+1} 类型`} value={guide.kind} onChange={event=>patch({layoutGuides:page.layoutGuides!.map((value,i)=>i===index?{...value,kind:event.target.value as 'columns'|'rows'|'grid'}:value)})}><option value="columns">列</option><option value="rows">行</option><option value="grid">网格</option></select></label>{(['count','size','gutter','margin'] as const).map(key=><Field key={key} label={({count:'数量',size:'尺寸',gutter:'间距',margin:'边距'})[key]} type="number" min={key==='count'?1:0} value={guide[key]} onChange={value=>patch({layoutGuides:page.layoutGuides!.map((item,i)=>i===index?{...item,[key]:Math.max(key==='count'?1:0,Math.min(key==='count'?1000:1000000,Number(value)))}:item)})}/>)}<button type="button" onClick={()=>patch({layoutGuides:page.layoutGuides!.filter((_,i)=>i!==index)})}>移除参考线</button></div>)}
    </section>
  </div>
}
