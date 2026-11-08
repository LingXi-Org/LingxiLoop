import {ArrowUpDown,MoveHorizontal} from 'lucide-react'
import ElementTextProperties from './ElementTextProperties'
import ElementTextStyle from './ElementTextStyle'
import type {TypographyCensus} from '../../../../shared/artifact-typography'
import ElementLayoutProperties from './ElementLayoutProperties'
import ElementTextAlignment from './ElementTextAlignment'
import ElementTextColor from './ElementTextColor'
import ElementSizingProperties from './ElementSizingProperties'
import ElementAlignmentControls from './ElementAlignmentControls'
import ElementLinkField from './ElementLinkField'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type ComponentProps } from 'react'
import type { ArtifactDocument, ArtifactNode, ArtifactPage } from '../../../../shared/artifact-document'
import type { ArtifactOperation } from '../../../../shared/artifact-operations'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../shared/artifact-themes'
import Field from './InspectorField'
import DesignArtboardProperties from './DesignArtboardProperties'
import { IconButton, Menu, MenuItem } from './EditorPrimitives'
import { FontField, FontVariantField } from './FontField'
import TextAreaField from './TextAreaField'
import { editorFontFacePatch, type EditorFont } from './editor-fonts'
import InspectorCode from './InspectorCode'
import DesignOutline from './DesignOutline'
import InspectorWidthGrip,{useDesignInspectorWidth} from './InspectorWidthGrip'
import type {NativeCodeDraftAccess} from './session'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

interface Props {
  measureArtboardHeight():number|undefined
  panelWidth:number;setPanelWidth(value:number):void
  outline:Omit<ComponentProps<typeof DesignOutline>,'document'|'selected'|'sheet'|'writable'|'dispatch'>
  inspectorTab: 'properties' | 'outline' | 'code' | 'theme'
  setInspectorTab(tab: 'properties' | 'outline' | 'code' | 'theme'): void
  onNotice(message:string):void
  onHistory(direction:'undo'|'redo'):void
  retainDraft(operations:ArtifactOperation[]):void
  commitCode(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
  codeDrafts:NativeCodeDraftAccess
  setInspectorOpen(open: boolean): void
  doc: ArtifactDocument
  typography?:TypographyCensus
  loadedPageIds:readonly string[]
  primary?: ArtifactNode
  current?: ArtifactPage
  primaryPadding?: { x: number; y: number }
  kind: 'design' | 'slides'
  canvasContentId?: string
  writable: boolean
  selected: string[]
  setSelected(ids: string[]): void
  inspectorBase: RefObject<ArtifactDocument | null>
  fileInput: RefObject<HTMLInputElement | null>
  replaceImage: RefObject<boolean>
  getBase(): ArtifactDocument | null
  beginInspector(): void
  dispatch(operations: ArtifactOperation[], base?: ArtifactDocument): void
  inspectDispatch(operations: ArtifactOperation[]): void
  patchNode(patch: Partial<ArtifactNode>, unset?: string[]): void
  beginCrop(node: ArtifactNode, page: ArtifactPage): void
  reorderLayer(front: boolean): void
  ungroup(): void
  groupSelection(): void
  align(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void
  distribute(axis: 'horizontal' | 'vertical'): void
  deleteSelection(): void
  pasteNodes(nodes: ArtifactNode[]): void
  selectedWithChildren(): ArtifactNode[]
}

export default function NativeInspector({measureArtboardHeight,panelWidth,setPanelWidth,outline,inspectorTab, setInspectorTab, setInspectorOpen, doc, primary, current, primaryPadding, kind, canvasContentId, writable, selected, setSelected, inspectorBase, fileInput, replaceImage, getBase, beginInspector, dispatch, inspectDispatch, patchNode, beginCrop, reorderLayer, ungroup, groupSelection, align, distribute, deleteSelection, pasteNodes, selectedWithChildren,typography,loadedPageIds,onNotice,commitCode,retainDraft,codeDrafts,onHistory}: Props) {
  const aside=useRef<HTMLElement|null>(null),[sheet,setSheet]=useState(false)
  useLayoutEffect(()=>{const root=aside.current?.closest<HTMLElement>('[data-native-artifact-editor]');if(!root)return;const update=()=>{setSheet(root.clientWidth<(kind==='design'?600:768));aside.current?.style.setProperty('--native-inspector-root-height',`${root.clientHeight}px`)},observer=new ResizeObserver(update);observer.observe(root);update();return()=>observer.disconnect()},[kind])
  useEffect(()=>{const root=aside.current?.closest<HTMLElement>('[data-native-artifact-editor]');if(root&&root.clientWidth>=600&&inspectorTab==='outline')setInspectorTab('properties')},[sheet,inspectorTab,setInspectorTab])
  const panelResize=useDesignInspectorWidth(aside,kind==='design',panelWidth,setPanelWidth)
  const codeField=useRef<HTMLTextAreaElement|null>(null),codeFocus=useRef(false)
  const tabs=[{id:'properties' as const,name:'属性'},...(kind==='design'&&sheet?[{id:'outline' as const,name:'图层'}]:[]),...(kind==='design'?[{id:'code' as const,name:'代码'}]:[]),{id:'theme' as const,name:'主题'}]
  const changeFont = (font: EditorFont) => {
    if (!primary || !current || !doc) return
    const initial = inspectorBase.current?.pages[current.id]?.nodes[primary.id] ?? primary
    const choice = font.theme ? { themeFont: font.theme, themeFontFallback: font.family } : { fontFamily: font.family }
    const family = artifactResolvedStyle({ ...initial.style, ...choice, ...(font.theme ? { fontFamily: undefined } : {}) }, doc).fontFamily ?? font.family
    patchNode({ style: { ...choice, ...editorFontFacePatch(family, initial.style) } }, font.theme ? ['style.fontFamily'] : ['style.themeFont', 'style.themeFontFallback'])
  }
  const changeElementTextColor=(value:string)=>{
    const base=inspectorBase.current??getBase(),page=current&&base?.pages[current.id]
    if(!base||!page)return
    try{
      const operations:ArtifactOperation[]=[]
      for(const id of selected){
        const node=page.nodes[id];if(!node)continue
        const before=nodeCodeEntries(node,page),values=new Map(before.map(entry=>[entry.name,entry.value]));values.set('color',value==='none'?'transparent':value)
        const {patch,unset}=nodeCodePatch(node,before,[...values].map(([name,value])=>({name,value})))
        if(Object.keys(patch).length||unset.length)operations.push({type:'node.patch',pageId:page.id,nodeId:id,patch,...(unset.length?{unset}:{})})
      }
      const latestPage=getBase()?.pages[page.id]
      if(!writable||selected.some(id=>!latestPage?.nodes[id]||latestPage.nodes[id].locked)){
        retainDraft(operations)
        return
      }
      inspectDispatch(operations)
    }catch{onNotice('文字颜色未能修改，请检查颜色后重试。')}
  }
  const multiTextNodes=current?selected.map(id=>current.nodes[id]).filter((node):node is ArtifactNode=>!!node&&['text','note'].includes(node.type)):[]
  const elementTextInspector=kind==='design'&&!!current&&current.id!==canvasContentId&&primary?.type!=='table'
  const textSpacingFields=primary&&<><Field label="行高" leadingIcon={elementTextInspector?<ArrowUpDown size={16} strokeWidth={1.5}/>:undefined} type="number" min={.5} max={10} value={primary.style.lineHeight??1.25} onChange={v=>patchNode({style:{lineHeight:Math.max(.5,Math.min(10,Number(v)))}})} /><Field label="字距" leadingIcon={elementTextInspector?<MoveHorizontal size={16} strokeWidth={1.5}/>:undefined} type="number" value={primary.style.letterSpacing??0} onChange={v=>patchNode({style:{letterSpacing:Number(v)}})} /></>
  return <aside ref={aside} className="native-inspector" data-sheet={sheet} aria-label="属性面板" onFocusCapture={beginInspector}>{kind==='design'&&!sheet&&<InspectorWidthGrip width={panelWidth} max={panelResize.max} defaultWidth={panelResize.defaultWidth} setWidth={setPanelWidth}/>}<header className="native-inspector-header"><div role="tablist" aria-label="属性选项卡" className="native-inspector-tabs">{tabs.map((tab,index)=><button key={tab.id} data-inspector-tab={tab.id} type="button" role="tab" className="native-panel-tab" aria-selected={inspectorTab===tab.id} tabIndex={inspectorTab===tab.id?0:-1} onClick={()=>{if(tab.id==='code'){if(inspectorTab==='code')codeField.current?.focus();else codeFocus.current=true}setInspectorTab(tab.id)}} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;codeFocus.current=false;setInspectorTab(tabs[next].id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()}}>{tab.name}</button>)}</div><span style={{flex:1}} /><IconButton icon="close" label="关闭属性" onClick={() => setInspectorOpen(false)} /></header>
      {kind==='design'&&<div className="native-inspector-outline-slot" data-sheet={sheet} hidden={inspectorTab==='theme'||sheet&&inspectorTab!=='outline'}><DesignOutline {...outline} document={doc} selected={selected} sheet={sheet} writable={writable} dispatch={dispatch}/></div>}
      {inspectorTab==='code'&&current&&<InspectorCode key={`${current.id}:${selected.join('|')}:${codeDrafts.generation()}`} document={doc} pageId={current.id} selected={selected} codeDrafts={codeDrafts} readOnly={!writable} field={codeField} requestFocus={codeFocus} getBase={getBase} dispatch={commitCode} onNotice={onNotice}/>}
      {inspectorTab === 'theme' && <div className="native-theme-picker" aria-label="主题选择"><button type="button" aria-pressed={!doc.themeId} disabled={!writable} onClick={()=>dispatch([{type:'document.patch',patch:{themeId:null}}])}>默认主题</button>{Object.values(doc.themes).map(theme=><button type="button" key={theme.id} aria-label={`使用主题 ${theme.name}`} disabled={!writable} aria-pressed={doc.themeId===theme.id} onClick={()=>dispatch([{type:'document.patch',patch:{themeId:theme.id}}])}><span className="native-theme-preview" style={{background:String(theme.tokens.background??'#faf8f4'),color:String(theme.tokens.text??'#141413')}}>文字</span>{theme.name}</button>)}</div>}
      <div className="native-properties-pane" hidden={inspectorTab!=='properties'}><fieldset disabled={!writable}>
        {primary ? <>
          {kind==='design'&&current&&current.id!==canvasContentId&&<ElementAlignmentControls node={current.nodes[primary.id]??primary} page={current} writable={writable} getBase={getBase} commit={commitCode} onNotice={onNotice}/>}
          {kind==='design'&&current&&current.id!==canvasContentId&&<ElementSizingProperties key={`sizing:${current.id}:${primary.id}`} node={current.nodes[primary.id]??primary} page={current} writable={writable} getBase={getBase} commit={commitCode} retain={retainDraft} onNotice={onNotice} onHistory={onHistory}/>}
          {kind==='design'&&current&&current.id!==canvasContentId&&<ElementLayoutProperties key={`layout:${current.id}:${primary.id}`} node={current.nodes[primary.id]??primary} page={current} writable={writable} getBase={getBase} commit={commitCode} retain={retainDraft} onHistory={onHistory} onNotice={onNotice}/>}
          {(kind!=='design'||!current||current.id===canvasContentId||primary.type==='group')&&<section className="native-property-section">{(kind!=='design'||!current||current.id===canvasContentId)&&<h3>布局</h3>}
            {(kind!=='design'||!current||current.id===canvasContentId)&&<Field label="内边距" type="number" min={0} value={primaryPadding?.x===primaryPadding?.y?primaryPadding?.x??0:''} placeholder={primaryPadding?.x!==primaryPadding?.y?'混合':undefined} onChange={v=>{const padding=Math.max(0,Number(v));patchNode({style:{padding,paddingX:padding,paddingY:padding}})}} />}
            {primary.type==='group'&&<><label className="native-field"><span>布局</span><select aria-label="布局" value={primary.layout?.mode??'absolute'} onChange={e=>patchNode({layout:{...primary.layout,mode:e.target.value as 'absolute'|'flex'|'grid'}})}><option value="absolute">自由布局</option><option value="flex">弹性布局</option><option value="grid">网格布局</option></select></label>
              {primary.layout?.mode==='flex'&&<label className="native-field"><span>方向</span><select aria-label="布局方向" value={primary.layout.direction??'row'} onChange={e=>patchNode({layout:{...primary.layout!,direction:e.target.value as 'row'|'column'}})}><option value="row">水平</option><option value="column">垂直</option></select></label>}
              {primary.layout?.mode==='grid'&&<Field label="列数" type="number" min={1} max={100} value={primary.layout.columns??2} onChange={v=>patchNode({layout:{...primary.layout!,columns:Math.max(1,Math.min(100,Math.round(Number(v))))}})} />}
              {primary.layout&&primary.layout.mode!=='absolute'&&<><Field label="间距" type="number" min={0} value={primary.layout.gap??0} onChange={v=>patchNode({layout:{...primary.layout!,gap:Math.max(0,Number(v))}})} /><label className="native-field"><span>交叉轴</span><select aria-label="交叉轴对齐" value={primary.layout.align??'stretch'} onChange={e=>patchNode({layout:{...primary.layout!,align:e.target.value as 'start'|'center'|'end'|'stretch'}})}><option value="start">起始</option><option value="center">居中</option><option value="end">末尾</option><option value="stretch">拉伸</option></select></label><label className="native-field"><span>主轴</span><select aria-label="主轴对齐" value={primary.layout.justify??'start'} onChange={e=>patchNode({layout:{...primary.layout!,justify:e.target.value as 'start'|'center'|'end'|'space-between'}})}><option value="start">起始</option><option value="center">居中</option><option value="end">末尾</option><option value="space-between">两端对齐</option></select></label></>}
            </>}
          </section>}
          {kind==='design'&&current&&<ElementLinkField key={`${current.id}:${primary.id}`} node={primary} pageId={current.id} writable={writable} getBase={getBase} commit={commitCode} retain={retainDraft}/>}
          {(primary.type==='text'||primary.type==='note'||primary.type==='table')&&<ElementTextProperties key={`text:${current?.id}:${primary.id}`} node={primary} page={current} enabled={elementTextInspector} writable={writable} getBase={getBase} commit={commitCode} onNotice={onNotice} alignment={kind==='design'&&current&&current.id!==canvasContentId?<ElementTextAlignment node={current.nodes[primary.id]??primary} page={current} writable={writable} getBase={getBase} commit={commitCode} onNotice={onNotice}/>:<div className="native-property-segment"><span>对齐</span><div>{(['left','center','right'] as const).map(direction=><IconButton key={direction} icon={direction} label={({left:'文本左对齐',center:'文本居中',right:'文本右对齐'})[direction]} active={(primary.style.textAlign??'left')===direction} onClick={()=>patchNode({style:{textAlign:direction}})} />)}<button type="button" aria-label="文本两端对齐" aria-pressed={primary.style.textAlign==='justify'} onClick={()=>patchNode({style:{textAlign:'justify'}})}>☰</button></div></div>}>
            {elementTextInspector&&current?<ElementTextStyle key={`style:${current.id}:${selected.join('|')}`} doc={doc} node={primary} nodeIds={selected} page={current} census={typography} loadedPageIds={loadedPageIds} writable={writable} getBase={getBase} commit={commitCode} onNotice={onNotice}/>:primary.type!=='table'&&<label className="native-field"><span>文本样式</span><select aria-label="文本样式" value={primary.richText?.content?.[0]?.type==='heading'?String(primary.richText.content[0].attrs?.level??1):'body'} onChange={e=>{const level=Number(e.target.value),heading=!!level,content=primary.richText?.content??[{type:'paragraph' as const,content:[{type:'text' as const,text:primary.text??''}]}];patchNode({richText:{type:'doc',content:content.map(block=>block.type==='paragraph'||block.type==='heading'?{...block,type:heading?'heading':'paragraph',attrs:{...block.attrs,...(heading?{level}: {})}}:block)},style:{fontSize:heading?({1:48,2:36,3:30,4:26,5:22,6:20} as Record<number,number>)[level]:24,fontWeight:heading?700:400}})}}><option value="body">正文</option>{[1,2,3,4,5,6].map(level=><option key={level} value={level}>标题 {level}</option>)}</select></label>}
            <FontField element={elementTextInspector} disabled={!writable} value={artifactResolvedStyle(primary.style,doc).fontFamily} theme={primary.style.themeFont} onBegin={()=>{inspectorBase.current=doc}} onChange={changeFont} />
            <FontVariantField disabled={!writable} family={artifactResolvedStyle(primary.style,doc).fontFamily} weight={primary.style.fontWeight} style={primary.style.fontStyle} onBegin={()=>{inspectorBase.current=getBase()}} onChange={variant=>patchNode({style:{fontWeight:variant.weight,fontStyle:variant.style}})} />
            <Field label="字号" unit={elementTextInspector} type="number" min={1} max={1000} value={primary.style.fontSize??32} onChange={v=>patchNode({style:{fontSize:Math.max(1,Math.min(1000,Number(v)))}})} />
            <div className="native-property-pair"><span>间距</span>{elementTextInspector?<div className="native-text-spacing-inputs">{textSpacingFields}</div>:textSpacingFields}</div>
            {kind==='design'&&current&&current.id!==canvasContentId&&primary.type!=='table'?<ElementTextColor document={doc} pageId={current.id} nodeId={primary.id} value={primary.css?.color??artifactResolvedStyle(primary.style,doc).color??'#222222'} disabled={!writable||!!primary.locked} mixed={selected.length!==1} onChange={changeElementTextColor}/>:<Field label="颜色" type="color" value={artifactResolvedStyle(primary.style,doc).color??'#222222'} onChange={v=>patchNode({style:{color:v==='none'?'transparent':v}},['style.themeColor'])} />}

          </ElementTextProperties>}
          {(primary.type==='image'||primary.type==='video')&&<section className="native-property-section"><h3>{primary.type==='image'?'图片':'视频'}</h3><div className="native-inspector-actions"><button type="button" onClick={()=>{replaceImage.current=true;fileInput.current?.click()}}>替换{primary.type==='video'?'视频':'图片'}</button><button type="button" onClick={()=>current&&beginCrop(primary,current)}>裁剪</button></div></section>}
          {primary.type==='math'&&<section className="native-property-section"><h3>公式</h3><TextAreaField key={primary.id} label="公式排版源码" value={primary.source??''} onCommit={source=>patchNode({source})} /></section>}
          {primary.type==='table'&&<section className="native-property-section"><h3>表格</h3><label className="native-check"><input type="checkbox" checked={primary.tableHeader??false} onChange={event=>patchNode({tableHeader:event.target.checked})} />标题行</label><div className="native-inspector-actions"><button type="button" disabled={(primary.cells?.length??0)>=100} onClick={()=>patchNode({cells:[...(primary.cells??[]),(primary.cells?.[0]??['','']).map(()=>'')]})}>添加行</button><button type="button" disabled={(primary.cells?.[0]?.length??0)>=100} onClick={()=>patchNode({cells:primary.cells?.map(row=>[...row,''])})}>添加列</button><button type="button" disabled={(primary.cells?.length??0)<=1} onClick={()=>patchNode({cells:primary.cells?.slice(0,-1)})}>删除行</button><button type="button" disabled={(primary.cells?.[0]?.length??0)<=1} onClick={()=>patchNode({cells:primary.cells?.map(row=>row.slice(0,-1))})}>删除列</button></div></section>}
          <section className="native-property-section"><h3>外观</h3>
            <Field label="填充" type="color" value={artifactResolvedStyle(primary.style,doc).fill??artifactResolvedStyle(primary.style,doc).backgroundColor??'none'} onChange={v=>v==='none'?patchNode({},['style.fill','style.backgroundColor','style.themeFill']):patchNode({style:{fill:v}},['style.themeFill'])} />
            <Field label="不透明度" type="number" min={0} max={1} value={primary.style.opacity??1} onChange={v=>patchNode({style:{opacity:Math.max(0,Math.min(1,Number(v)))}})} />
            <Field label="圆角" type="number" min={0} value={primary.style.borderRadius??0} onChange={v=>patchNode({style:{borderRadius:Math.max(0,Number(v))}})} />
            <Field label="描边" type="color" value={primary.style.stroke??primary.style.borderColor??'none'} onChange={v=>v==='none'?patchNode({},['style.stroke','style.borderColor']):patchNode({style:{stroke:v}})} />
            <Field label="线宽" type="number" min={0} value={primary.style.strokeWidth??primary.style.borderWidth??0} onChange={v=>patchNode({style:{strokeWidth:Math.max(0,Number(v))}})} />
            <label className="native-field"><span>描边样式</span><select aria-label="描边样式" value={primary.style.borderStyle??'solid'} onChange={e=>patchNode({style:{borderStyle:e.target.value as 'solid'|'dashed'|'dotted'|'double'|'none'}})}><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option><option value="double">双线</option><option value="none">无</option></select></label>
          </section>
          <details className="native-property-disclosure"><summary>效果</summary>
          <details className="native-inspector-section"><summary>渐变</summary><label className="native-field"><span>填充类型</span><select aria-label="填充类型" value={primary.style.gradient?.type ?? 'solid'} onChange={e => e.target.value === 'solid' ? patchNode({}, ['style.gradient']) : patchNode({style:{gradient:{type:e.target.value as 'linear'|'radial',angle:90,stops:[{color:'#d97757',offset:0},{color:'#f5d5c6',offset:1}]}}})}><option value="solid">纯色</option><option value="linear">线性渐变</option><option value="radial">径向渐变</option></select></label>{primary.style.gradient && <><Field label="角度" type="number" value={primary.style.gradient.angle} onChange={v => patchNode({style:{gradient:{...primary.style.gradient!,angle:Number(v)}}})} />{primary.style.gradient.stops.map((stop,index) => <div key={index} className="native-gradient-stop"><Field label={`色标 ${index+1}`} type="color" value={stop.color} onChange={color => patchNode({style:{gradient:{...primary.style.gradient!,stops:primary.style.gradient!.stops.map((s,i) => i===index ? {...s,color} : s)}}})} /><Field label="位置" type="number" min={0} max={1} value={stop.offset} onChange={v => patchNode({style:{gradient:{...primary.style.gradient!,stops:primary.style.gradient!.stops.map((s,i) => i===index ? {...s,offset:Math.max(0,Math.min(1,Number(v)))} : s)}}})} /></div>)}<button type="button" onClick={() => patchNode({style:{gradient:{...primary.style.gradient!,stops:[...primary.style.gradient!.stops,{color:'#ffffff',offset:.5}]}}})}>添加色标</button></>}</details>
          <details className="native-inspector-section"><summary>阴影</summary><label className="native-check"><input type="checkbox" checked={!!primary.style.shadow} onChange={e => e.target.checked ? patchNode({style:{shadow:{x:0,y:4,blur:12,spread:0,color:'#00000040'}}}) : patchNode({},['style.shadow'])} />阴影</label>{primary.style.shadow && <>{(['x','y','blur','spread'] as const).map(key => <Field key={key} label={({x:'横坐标',y:'纵坐标',blur:'模糊',spread:'扩展'})[key]} type="number" value={primary.style.shadow![key]} onChange={v => patchNode({style:{shadow:{...primary.style.shadow!,[key]:key === 'blur' ? Math.max(0,Number(v)) : Number(v)}}})} />)}<Field label="阴影颜色" type="color" value={primary.style.shadow.color} onChange={color => patchNode({style:{shadow:{...primary.style.shadow!,color}}})} /></>}</details>

          </details>
          <details className="native-property-disclosure"><summary>高级</summary>
            <div className="native-field-grid">{(['x','y','width','height','rotation'] as const).map(key=><Field key={key} label={({x:'横坐标',y:'纵坐标',width:'宽',height:'高',rotation:'旋转'})[key]} type="number" value={primary[key]} onChange={v=>{if(Number.isFinite(Number(v)))patchNode({[key]:Number(v)})}} />)}</div>
            {(primary.type==='image'||primary.type==='video')&&<>{(['x','y','width','height'] as const).map(key=><Field key={key} label={`裁剪${({x:'横坐标',y:'纵坐标',width:'宽度',height:'高度'})[key]}`} type="number" min={0} max={1} value={primary.crop?.[key]??(key==='width'||key==='height'?1:0)} onChange={v=>patchNode({crop:{x:0,y:0,width:1,height:1,...primary.crop,[key]:Math.max(key==='width'||key==='height'?.01:0,Math.min(1,Number(v)))}})} />)}</>}
            <div className="native-inspector-actions"><IconButton icon="flipX" label="水平翻转" active={primary.flipX} onClick={()=>patchNode({flipX:!primary.flipX})} /><IconButton icon="flipY" label="垂直翻转" active={primary.flipY} onClick={()=>patchNode({flipY:!primary.flipY})} /><IconButton icon="up" label="置于顶层" onClick={()=>reorderLayer(true)} /><IconButton icon="down" label="置于底层" onClick={()=>reorderLayer(false)} /></div>
            {primary.type==='group'&&<button type="button" onClick={ungroup}>取消组合</button>}
            <label className="native-check"><input type="checkbox" checked={primary.locked??false} onChange={e=>patchNode({locked:e.target.checked})} />锁定</label>
          </details>
        </> : selected.length>1 ? <section className="native-property-section"><h3>已选 {selected.length} 个元素</h3><button type="button" onClick={groupSelection}>组合</button></section> : current && current.id!==canvasContentId&&(kind==='slides'||outline.selectedPages.length===1&&outline.selectedPages.includes(current.id)) ? kind==='design'?<DesignArtboardProperties key={current.id} document={doc} page={current} dispatch={inspectDispatch} measureHeight={measureArtboardHeight} writable={writable}/>:<>
          <section className="native-property-section"><h3>幻灯片</h3><div className="native-field"><span>转场</span><Menu className="native-transition-menu" label={`转场：${({none:'无',fade:'淡入淡出',push:'推移',magic:'神奇移动',slide:'推移'})[current.transition]}`} text={({none:'无',fade:'淡入淡出',push:'推移',magic:'神奇移动',slide:'推移'})[current.transition]} minimumWidth={219} offset={6} popupRole="menu" disabled={!writable}>{(['none','fade','push','magic'] as const).map(value=><MenuItem key={value} role="menuitemradio" aria-checked={current.transition===value||value==='push'&&current.transition==='slide'} selected={current.transition===value||value==='push'&&current.transition==='slide'} onClick={()=>inspectDispatch([{type:'page.patch',pageId:current.id,patch:{transition:value}}])}>{({none:'无',fade:'淡入淡出',push:'推移',magic:'神奇移动'})[value]}</MenuItem>)}</Menu></div>{current.transition==='magic'&&<p className="native-transition-help">神奇移动会将本页与下一页共有的元素移动到新位置。复制本页后，再移动或调整元素大小，即可保留它们的配对关系。</p>}</section>
          <section className="native-property-section"><h3>外观</h3><Field label="背景" type="color" value={artifactPageBackground(current,doc)} onChange={v=>inspectDispatch([{type:'page.patch',pageId:current.id,patch:{background:v==='none'?'transparent':v},unset:['themeBackground']}])} /></section>
          <details className="native-property-disclosure"><summary>高级</summary>
            <label className="native-field"><span>纸张</span><select aria-label="页面尺寸" value={current.paper ?? 'custom'} onChange={event => { const paper = event.target.value as 'A4' | 'Letter' | 'custom'; inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { paper, ...(paper === 'A4' ? { width: 794, height: 1123 } : paper === 'Letter' ? { width: 816, height: 1056 } : {}) } }]) }}><option value="custom">自定义</option><option value="A4">A4</option><option value="Letter">美式信纸</option></select></label><label className="native-field"><span>页面高度</span><select aria-label="页面高度模式" value={current.sizing ?? 'fixed'} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { sizing: event.target.value as 'fixed' | 'flow' } }])}><option value="fixed">固定</option><option value="flow">随内容增长</option></select></label><Field label="标题" value={current.title} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { title: value } }])} /><Field label="宽" type="number" value={current.width} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { width: Math.max(1, Number(value)) } }])} /><Field label="高" type="number" value={current.height} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { height: Math.max(1, Number(value)) } }])} /><label className="native-check"><input type="checkbox" checked={current.skip} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { skip: event.target.checked } }])} />放映时跳过</label><button type="button" onClick={() => { inspectDispatch([{ type: 'page.delete', pageId: current.id }]); setSelected([]) }}>删除页面</button>
          </details>
        </> : kind==='design'&&!selected.length?<div className="native-inspector-empty"><strong>未选择任何内容</strong><p>点击设计中的任意元素，可在此编辑其属性。</p></div>:null}
        {!primary&&kind==='design'&&current&&current.id!==canvasContentId&&selected.length>1&&multiTextNodes.length===selected.length&&<section className="native-property-section native-element-text-properties"><header><h3>文本</h3></header><div className="native-element-text-body"><ElementTextStyle key={`style:${current.id}:${selected.join('|')}`} doc={doc} node={multiTextNodes[0]} nodeIds={selected} page={current} census={typography} loadedPageIds={loadedPageIds} writable={writable} getBase={getBase} commit={commitCode} onNotice={onNotice}/></div></section>}
        {selected.length > 0 && <><h4>排列</h4><div className="native-inspector-actions">{(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(direction => <button type="button" key={direction} onClick={() => align(direction)}>{({ left: '左对齐', center: '水平居中', right: '右对齐', top: '顶部', middle: '垂直居中', bottom: '底部' })[direction]}</button>)}<button type="button" disabled={selected.length<3} onClick={() => distribute('horizontal')}>水平分布</button><button type="button" disabled={selected.length<3} onClick={() => distribute('vertical')}>垂直分布</button><button type="button" onClick={deleteSelection}>删除元素</button><button type="button" onClick={() => pasteNodes(selectedWithChildren())}>复制元素</button></div></>}
      </fieldset></div></aside>
}
