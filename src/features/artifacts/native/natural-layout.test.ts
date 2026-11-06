import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage,createDocument} from '../../../../shared/artifact-document'
import {NaturalLayouts,NaturalNodeSizes,withNaturalLayout,naturalMeasurementBatch,naturalNodeStyle} from './natural-layout'
import {elementBounds} from './visibility'

test('natural note geometry reaches visibility calculations without changing stored content or fixed objects',()=>{
  const page=createPage('contents'),note={...createNode('note','note'),height:40},shape=createNode('shape','shape')
  page.nodes={note,shape};page.nodeOrder=['note','shape']
  const original=JSON.stringify(page),sizes=new NaturalLayouts().forPage(page.id)
  sizes.set(note,{width:240,height:425.9375});sizes.set(shape,{width:999,height:999})
  const view=withNaturalLayout(page,sizes)
  assert.equal(view.nodes.note!.height,425.9375)
  assert.equal(view.nodes.shape,shape)
  assert.equal(view.nodeOrder,page.nodeOrder)
  assert.equal(JSON.stringify(page),original)
  assert.ok(elementBounds(view).find(bounds=>bounds.id==='note')!.height>425)
  const edited={...page,nodes:{...page.nodes,note:{...note,text:'另一位作者修改的内容'}}}
  assert.equal(withNaturalLayout(edited,sizes),edited,'old node layout does not override a new immutable node')
})

test('natural layout caches evict pages and keep recent page identities within the eight-page bound',()=>{
  const layouts=new NaturalLayouts(),first=layouts.forPage('first'),zero=layouts.forPage('page-0')
  for(let i=1;i<7;i++)layouts.forPage(`page-${i}`)
  assert.equal(layouts.size,8)
  assert.equal(layouts.forPage('first'),first)
  layouts.forPage('next')
  assert.equal(layouts.size,8)
  const evicted=layouts.forPage('page-0')
  assert.notEqual(evicted,zero)
  assert.equal(layouts.forPage('first'),first)
  assert.equal(layouts.size,8)
})

test('natural note sizes survive unrelated page cloning but invalidate text, width and effective font changes',()=>{
  const page=createPage('contents'),note={...createNode('note','note'),text:'中文自动换行'.repeat(100),width:240,height:832}
  page.nodes={note};page.nodeOrder=['note']
  const sizes=new NaturalLayouts().forPage(page.id);sizes.set(note,{width:240,height:4659})
  const cloned=structuredClone(page)
  assert.equal(withNaturalLayout(cloned,sizes).nodes.note!.height,4659,'unrelated operations clone the whole body')
  for(const patch of [{text:'新文字'},{width:400},{style:{...note.style,fontSize:48}}]){
    const changed={...cloned,nodes:{note:{...cloned.nodes.note!,...patch}}}
    assert.equal(withNaturalLayout(changed,sizes),changed,'changed layout dependencies cannot reuse old dimensions')
  }
  const moved={...cloned,nodes:{note:{...cloned.nodes.note!,x:-500,y:900,rotation:45}}}
  assert.equal(withNaturalLayout(moved,sizes).nodes.note!.height,4659)
})

test('exact dependency caches have bounded entry count and retained text',()=>{
  const sizes=new NaturalNodeSizes()
  for(let i=0;i<400;i++)sizes.set({...createNode('note',`note-${i}`),text:'中文'.repeat(500)},{width:240,height:400})
  assert.ok(sizes.size<=256);assert.ok(sizes.dependencyCharacters<=262144)
  const large={...createNode('note','large'),text:'\0'.repeat(100000)}
  sizes.set(large,{width:240,height:20000});assert.equal(sizes.get(large)?.height,20000,'live weak measurements need no retained dependency text')
  assert.ok(sizes.dependencyCharacters<=262144)
  const node=createNode('note','effective-font');sizes.set(node,{width:240,height:100},{fontSize:14})
  assert.equal(sizes.get(structuredClone(node),{fontSize:14})?.height,100)
  assert.equal(sizes.get(node,{fontSize:32}),undefined)
})

test('cache misses request at most eight inert measurements and stop after their live layout is known',()=>{
  const page=createPage('contents');for(let i=0;i<20;i++){const node=createNode('note',`note-${i}`);page.nodes[node.id]=node;page.nodeOrder.push(node.id)}
  const document={themes:{},themeId:null} as never,sizes=new NaturalNodeSizes(),original=JSON.stringify(page)
  const first=naturalMeasurementBatch(page,sizes,document);assert.equal(first.length,8)
  for(const node of first)sizes.set(node,{width:240,height:4659})
  assert.equal(naturalMeasurementBatch(page,sizes,document)[0]!.id,'note-8')
  for(const node of Object.values(page.nodes))sizes.set(node,{width:240,height:4659})
  assert.deepEqual(naturalMeasurementBatch(page,sizes,document),[])
  assert.equal(JSON.stringify(page),original)
})

test('probe and cache typography include inherited group fonts but preserve child overrides',()=>{
  const page=createPage('contents'),note={...createNode('note','note'),text:'i'.repeat(2000),parentId:'group',width:240,height:832,style:{fontSize:32}},group={...createNode('group','group'),style:{fontFamily:'monospace',fontWeight:700,fontStyle:'italic' as const,letterSpacing:2}}
  page.nodes={group,note};page.nodeOrder=['group','note']
  const inherited=naturalNodeStyle(page,note),sizes=new NaturalNodeSizes()
  assert.equal(inherited.fontFamily,'monospace');assert.equal(inherited.fontWeight,700);assert.equal(inherited.fontStyle,'italic');assert.equal(inherited.letterSpacing,2)
  sizes.set(note,{width:240,height:8463},inherited,0)
  assert.equal(withNaturalLayout(structuredClone(page),sizes).nodes.note!.height,8463)
  const changed=structuredClone(page);changed.nodes.group!.style.fontFamily='sans-serif'
  assert.equal(withNaturalLayout(changed,sizes),changed,'changing only an ancestor font invalidates the child measurement')
  const explicit={...note,style:{...note.style,fontFamily:'sans-serif',fontWeight:400,fontStyle:'normal' as const,letterSpacing:0}}
  assert.equal(naturalNodeStyle(page,explicit).fontFamily,'sans-serif');assert.equal(naturalNodeStyle(page,explicit).fontWeight,400)
})

test('inherited font keywords follow child and intermediate ancestors and invalidate on the resolved family',()=>{
  const page=createPage('contents'),outer={...createNode('group','outer'),style:{fontFamily:'monospace'}},middle={...createNode('group','middle'),parentId:'outer',style:{fontFamily:'unset'}},note={...createNode('note','note'),parentId:'middle',text:'i'.repeat(2000),width:240,height:832,style:{fontSize:32,fontFamily:'inherit'}}
  page.nodes={outer,middle,note};page.nodeOrder=['outer','middle','note']
  for(const keyword of ['inherit','unset','revert','revert-layer',' InHerIt ','']){
    const current={...note,style:{...note.style,fontFamily:keyword}}
    assert.equal(naturalNodeStyle(page,current).fontFamily,'monospace')
  }
  assert.equal(naturalNodeStyle(page,{...note,style:{fontFamily:'initial'}}).fontFamily,'initial')
  assert.equal(naturalNodeStyle(page,{...note,style:{fontFamily:'"inherit"'}}).fontFamily,'"inherit"')
  const sizes=new NaturalNodeSizes();sizes.set(note,{width:240,height:8463},naturalNodeStyle(page,note),0)
  const changed=structuredClone(page);changed.nodes.outer!.style.fontFamily='sans-serif'
  assert.equal(naturalNodeStyle(changed,changed.nodes.note!).fontFamily,'sans-serif')
  assert.equal(withNaturalLayout(changed,sizes),changed)
})

test('a flow-group measurement remains an atomic sibling layout and changes invalidate the cached box',()=>{
  const page=createPage('contents'),group={...createNode('group','group'),width:120,height:180,layout:{mode:'flex' as const,direction:'row' as const,align:'start' as const}},note={...createNode('note','note'),parentId:'group',text:'a '.repeat(400),width:240,height:832}
  page.nodes={group,note};page.nodeOrder=['group','note']
  const sizes=new NaturalNodeSizes(),document={...createDocument('design','design','布局'),seq:1}
  assert.deepEqual(naturalMeasurementBatch(page,sizes,document).map(node=>node.id),['note'])
  sizes.set(note,{width:120,height:9308},naturalNodeStyle(page,note),1)
  assert.equal(withNaturalLayout(page,sizes,document).nodes.note!.width,120)
  assert.equal(withNaturalLayout(page,sizes,{...document,seq:2}),page)
})

test('grid row offsets reach spatial bounds without mutating the authored zero positions',()=>{
  const page=createPage('contents'),group={...createNode('group','group'),x:688,y:-778,width:480,height:3000,layout:{mode:'grid' as const,columns:2,gap:20,align:'start' as const}}
  page.nodes={group};page.nodeOrder=['group'];const document={...createDocument('design','d','布局'),seq:1},sizes=new NaturalNodeSizes()
  for(let i=0;i<4;i++){const node={...createNode('note',`note-${i}`),parentId:'group',x:0,y:0,width:240,height:832};page.nodes[node.id]=node;page.nodeOrder.push(node.id);sizes.set(node,{width:240,height:3128,x:i%2*250,y:Math.floor(i/2)*1510},naturalNodeStyle(page,node),1)}
  const original=JSON.stringify(page),view=withNaturalLayout(page,sizes,document),second=elementBounds(view).find(node=>node.id==='note-2')!
  assert.equal(view.nodes['note-2']!.y,1510);assert.equal(second.y,group.y+1510-2)
  assert.equal(page.nodes['note-2']!.y,0);assert.equal(JSON.stringify(page),original)
})

test('flow shapes recover their complete layout unit even when it contains no sticky notes',()=>{
  const document=createDocument('design','d'),page=createPage('p'),group={...createNode('group','g'),layout:{mode:'grid' as const,columns:2}},shape={...createNode('shape','s'),parentId:'g'}
  page.nodes={g:group,s:shape};page.nodeOrder=['g','s'];document.pages={p:page};document.pageOrder=['p']
  const sizes=new NaturalNodeSizes();assert.deepEqual(naturalMeasurementBatch(page,sizes,document).map(node=>node.id),['s'])
  sizes.set(shape,{width:240,height:3128,x:250,y:6296},naturalNodeStyle(page,shape,document),document.seq)
  assert.deepEqual(naturalMeasurementBatch(page,sizes,document),[])
  assert.equal(withNaturalLayout(page,sizes,document).nodes.s!.y,6296)
  assert.equal(page.nodes.s!.y,80)
})

test('content-sized text participates in bounded measurement and does not constrain its next text revision',()=>{
  const document=createDocument('design','d'),page=createPage('p'),node={...createNode('text','t'),textSizing:'content' as const,width:2000}
  page.nodes={t:node};page.nodeOrder=['t'];document.pages={p:page};document.pageOrder=['p']
  const sizes=new NaturalNodeSizes();assert.equal(naturalMeasurementBatch(page,sizes,document)[0],node)
  sizes.set(node,{width:172,height:55.36},naturalNodeStyle(page,node,document));assert.equal(withNaturalLayout(page,sizes,document).nodes.t!.width,172)
  const changed={...node,text:'中文标题'.repeat(100)}
  assert.equal(sizes.get(changed),undefined);assert.equal(node.width,2000)
})
