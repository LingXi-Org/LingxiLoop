import { createHash } from 'node:crypto'
import { fixtureImage } from './native-artifact-fixture.mjs'

/** A small paired visual document. The 50-page functional/performance fixture
 * remains separate and unchanged. Native and upstream receive the same geometry. */
export function createVisualFixture(kind, id='fixture') {
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
  const bytes=fixtureImage(2,32,18),data=`data:image/png;base64,${bytes.toString('base64')}`
  const images=[{id:'image-1',bytes,contentType:'image/png',sha256:hash(bytes),width:32,height:18}]
  const document={schemaVersion:1,id,kind,title:'LingxiLoop',seq:0,themeId:null,themes:{},assets:{'image-1':{id:'image-1',url:'/api/artifacts/fixture/assets/image-1',contentType:'image/png',sha256:hash(bytes),width:32,height:18}},pageOrder:[],pages:{},versions:{}}
  const files=new Map(),boards={}
  for(let i=1;i<=3;i++) {
    const pageId=`page-${i}`,node=(type,name,x,y,width,height,extra={})=>({id:`${pageId}-${name}`,type,x,y,width,height,rotation:0,parentId:null,style:{},...extra})
    const nodes=[node('text','heading',64,40,1152,76,{text:`LingxiLoop ${i}`,richText:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:`LingxiLoop ${i}`}]}]},style:{fontFamily:'Arial',fontSize:48,fontWeight:700,lineHeight:1.25,color:'#18332b'}}),node('image','image',64,200,640,360,{assetId:'image-1'}),node('shape','shape',760,440,180,80,{shape:'rect',style:{fill:'#426b46',borderRadius:12}})]
    const p={id:pageId,title:`Page ${i}`,x:kind==='design'?(i-1)*2080:0,y:0,width:1920,height:1080,background:'#faf8f4',notes:'',skip:false,transition:'none',nodeOrder:nodes.map(n=>n.id),nodes:Object.fromEntries(nodes.map(n=>[n.id,n]))}
    if(kind==='design'){
      const rootId=`${pageId}-root`
      for(const node of nodes)node.parentId=rootId
      const root={id:rootId,type:'group',x:0,y:0,width:1920,height:1080,rotation:0,parentId:null,style:{backgroundColor:'#faf8f4'},layout:{mode:'absolute'},css:{position:'relative'}}
      p.nodes[rootId]=root;p.nodeOrder.unshift(rootId);p.background='#ffffff'
    }
    document.pages[pageId]=p;document.pageOrder.push(pageId)
    const source=kind==='slides'?'project/ds/fixture/image-1.png':data
    const body=`<h1 style="position:absolute;left:64px;top:40px;width:1152px;height:76px;margin:0;font-family:Arial;font-size:48px;font-weight:700;line-height:1.25;color:#18332b">LingxiLoop ${i}</h1><img src="${source}" style="position:absolute;left:64px;top:200px;width:640px;height:360px;object-fit:cover"><div style="position:absolute;left:760px;top:440px;width:180px;height:80px;border-radius:12px;background:#426b46"></div>`
    if(kind==='slides')files.set(`project/slides/${pageId}.html`,Buffer.from(`<section id="${pageId}" style="position:relative;width:1920px;height:1080px;background:#faf8f4">${body}</section>`))
    else {const filename=`Page${i}.dc.html`;boards[filename]={x:p.x,y:p.y,w:1920,h:1080,title:p.title};files.set(`project/${filename}`,Buffer.from(`<html><body><x-dc><div style="position:relative;width:1920px;height:1080px;background:#faf8f4">${body}</div></x-dc></body></html>`))}
  }
  if(kind==='slides'){files.set('project/deck.json',Buffer.from(JSON.stringify({v:4,lists:'css',title:document.title,order:document.pageOrder,sections:{},faces:{},designSystems:[]})));files.set('project/ds/fixture/image-1.png',bytes)}
  else files.set('project/canvas.json',Buffer.from(JSON.stringify({v:3,title:document.title,launch:{view:'canvas'},pages:[],boards,order:Object.keys(boards),notes:{},designSystems:[]})))
  return {document,images,legacyFiles:files,manifest:{version:1,semanticSha256:hash(JSON.stringify(document))}}
}
