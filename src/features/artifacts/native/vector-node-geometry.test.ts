import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocument,createNode,createPage} from '../../../../shared/artifact-document'
import {nodeMatrix} from '../../../../shared/artifact-geometry'
import {applyOperations,prepareBatch,artifactVersionKey} from '../../../../shared/artifact-operations'
import {parseEditableVector,mapEditableVector,moveVectorPart} from '../../../../shared/artifact-vector-edit'
import {vectorNodePatch,vectorReadKeys} from './vector-node-geometry'

function fixture(angle:number,flipX:boolean,flipY:boolean){
  const document=createDocument('design','point-document'),page=createPage('point-page'),group={...createNode('group','point-group'),x:30,y:40,width:900,height:600,rotation:12},node={...createNode('drawing','path'),parentId:group.id,x:120.25,y:140.5,width:240,height:160,rotation:angle,flipX,flipY,path:{d:'M0 10 L100 0 L120 80',width:120,height:80}}
  page.nodes={[group.id]:group,[node.id]:node};page.nodeOrder=[group.id,node.id];document.pages={[page.id]:page};document.pageOrder=[page.id]
  return{document,page,node,group}
}
for(const inset of [{x:0,y:0},{x:30,y:30},{x:12,y:40}])for(const angle of [0,27,90])for(const flipX of [false,true])for(const flipY of [false,true])test(`控制点编辑保留组合变换：${angle}度，翻转${flipX}/${flipY}，内边距${inset.x}/${inset.y}`,()=>{
  const {document,page,node}=fixture(angle,flipX,flipY),matrix=nodeMatrix(page,node)
  node.style={padding:inset.x,paddingX:inset.x,paddingY:inset.y};const before=JSON.stringify(document)
  const local=parseEditableVector(node.path.d,{ox:inset.x,oy:inset.y,sx:(node.width-2*inset.x)/node.path.width,sy:(node.height-2*inset.y)/node.path.height},1.25)!
  const path=mapEditableVector(local,p=>({x:matrix[0]*p.x+matrix[2]*p.y+matrix[4],y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]})),point=path.contours[0].anchors[1]
  const edited=moveVectorPart(path,{contour:0,anchor:1,part:'anchor'},{x:point.x+20,y:point.y-10}),patch=vectorNodePatch(edited,node,{matrix,width:node.width,height:node.height})!
  const next=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch}])).document,n=next.pages[page.id].nodes[node.id],m=nodeMatrix(next.pages[page.id],n)
  const reopened=mapEditableVector(parseEditableVector(n.path!.d,{ox:inset.x,oy:inset.y,sx:(n.width-2*inset.x)/n.path!.width,sy:(n.height-2*inset.y)/n.path!.height},1.25)!,p=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]}))
  for(let i=0;i<3;i++)assert.ok(Math.hypot(reopened.contours[0].anchors[i].x-edited.contours[0].anchors[i].x,reopened.contours[0].anchors[i].y-edited.contours[0].anchors[i].y)<.1,'持久化舍入误差在最大八倍缩放时仍小于一像素')
  assert.equal(n.rotation,angle);assert.equal(n.flipX,flipX);assert.equal(n.flipY,flipY);assert.equal(JSON.stringify(document),before)
})
test('point transforms guard parent geometry while independent parent colors remain mergeable',()=>{
  const {document,page,node,group}=fixture(27,false,true),keys=vectorReadKeys(document,page.id,node.id)
  assert.ok(keys.includes(artifactVersionKey.node(page.id,node.id,'field/rotation')))
  assert.ok(keys.includes(artifactVersionKey.node(page.id,node.id,'field/style.paddingX')))
  assert.ok(keys.includes(artifactVersionKey.node(page.id,group.id,'field/x')))
  const batch=prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{width:250}}]);for(const key of keys)batch.expectedVersions[key]=document.versions[key]??0
  const moved=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:group.id,patch:{x:60}}])).document
  assert.throws(()=>applyOperations(moved,batch),/changed/)
  const padded=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{style:{paddingX:30}}}])).document
  assert.throws(()=>applyOperations(padded,batch),/changed/)
  const colored=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:group.id,patch:{style:{color:'#ff0000'}}}])).document
  const merged=applyOperations(colored,batch).document;assert.equal(merged.pages[page.id].nodes[node.id].width,250);assert.equal(merged.pages[page.id].nodes[group.id].style.color,'#ff0000')
})
