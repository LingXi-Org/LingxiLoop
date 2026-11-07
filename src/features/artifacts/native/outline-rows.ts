import type {ArtifactDocument,ArtifactNode} from '../../../../shared/artifact-document'

export interface OutlineRow {
  key:string;kind:'page'|'node'|'pending';pageId:string;node?:ArtifactNode
  parentKey:string|null;level:number;position:number;size:number;expandable:boolean;expanded:boolean
}

/** Flatten only expanded branches; nodeOrder remains the order inside each parent. */
export function outlineRows(document:ArtifactDocument,pageIds:readonly string[],expanded:ReadonlySet<string>,loaded:ReadonlySet<string>=new Set(Object.keys(document.pages))):OutlineRow[]{
  const rows:OutlineRow[]=[],pages=pageIds.filter(id=>document.pages[id])
  pages.forEach((pageId,index)=>{
    const page=document.pages[pageId],key=`page:${pageId}`,expandable=!loaded.has(pageId)||page.nodeOrder.length>0,open=expandable&&expanded.has(key)
    rows.push({key,kind:'page',pageId,parentKey:null,level:1,position:index+1,size:pages.length,expandable,expanded:open})
    if(!open)return
    if(!loaded.has(pageId)){rows.push({key:`pending:${pageId}`,kind:'pending',pageId,parentKey:key,level:2,position:1,size:1,expandable:false,expanded:false});return}
    const children=new Map<string|null,ArtifactNode[]>()
    for(const id of page.nodeOrder){const node=page.nodes[id],siblings=children.get(node.parentId)??[];siblings.push(node);children.set(node.parentId,siblings)}
    const visit=(parentId:string|null,parentKey:string,level:number)=>{
      const siblings=children.get(parentId)??[]
      siblings.forEach((node,index)=>{
        const key=`node:${pageId}:${node.id}`,expandable=!!children.get(node.id)?.length,open=expandable&&expanded.has(key)
        rows.push({key,kind:'node',pageId,node,parentKey,level,position:index+1,size:siblings.length,expandable,expanded:open})
        if(open)visit(node.id,key,level+1)
      })
    }
    visit(null,key,2)
  })
  return rows
}

/** The reference names unnamed groups from their first textual descendant. */
export function outlineNodeSummary(document:ArtifactDocument,pageId:string,node:ArtifactNode):string|undefined{
  if(node.name||node.text)return node.name||node.text
  if(node.type!=='group')return
  const page=document.pages[pageId]
  const visit=(id:string):string|undefined=>{
    for(const key of page.nodeOrder){const child=page.nodes[key];if(child.parentId!==id)continue;if(child.text)return child.text;if(child.type==='group'){const text=visit(child.id);if(text)return text}}
  }
  return visit(node.id)
}
