import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document'
import { PageThumbnail } from './thumbnail'
import {Parser} from 'htmlparser2'
import {artifactPreviews} from '../../../../shared/artifact-previews'

test('Design缩略图还原字体后继承画板默认与父级字体',()=>{
 const document=createDocument('design','font-default'),page=createPage('page'),node=createNode('text','text');node.style={fontSize:48};node.text='继承文字';page.nodes.text=node;page.nodeOrder=['text'];document.pages.page=page;document.pageOrder=['page']
 assert.match(renderToStaticMarkup(createElement(PageThumbnail,{page,document,loaded:true})),/font-family="Times New Roman"/)
 const group={...createNode('group','group'),style:{fontFamily:'Georgia'}}
 const groupedPage={...page,nodes:{...page.nodes,text:{...node,parentId:'group'},group},nodeOrder:['group','text']}
 const groupedDocument={...document,pages:{page:groupedPage}}
 assert.match(renderToStaticMarkup(createElement(PageThumbnail,{page:groupedPage,document:groupedDocument,loaded:true})),/font-family="Georgia"/)
})

test('链接缩略图保留局部下划线，紧凑摘要不携带网址或挂载链接',()=>{
  const document=createDocument('slides','link-thumb'),page=createPage('link-page'),node=createNode('text','link-text')
  node.text='前链接后';node.richText={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'前'},{type:'text',text:'链接',marks:[{type:'link',attrs:{href:'https://private-link.test/author-data'}}]},{type:'text',text:'后'}]}]}
  page.nodes[node.id]=node;page.nodeOrder=[node.id];document.pages[page.id]=page;document.pageOrder=[page.id]
  const before=JSON.stringify(document)
  for(const value of [page,artifactPreviews(document)[page.id]]){
    const output=renderToStaticMarkup(createElement(PageThumbnail,{page:value,document,loaded:true})),stack:boolean[]=[],characters:Array<[string,boolean]>=[]
    const parser=new Parser({onopentag(_tag,attributes){const decoration=attributes['text-decoration']??attributes.style?.match(/text-decoration:([^;]+)/)?.[1];stack.push(decoration?decoration.includes('underline'):stack.at(-1)??false)},ontext(text){for(const character of text)characters.push([character,stack.at(-1)??false])},onclosetag(){stack.pop()}})
    parser.write(output);parser.end()
    assert.deepEqual(characters,[['前',false],['链',true],['接',true],['后',false]])
    assert.doesNotMatch(output,/href=|private-link|<a\b/)
    if(value!==page)assert.ok(!JSON.stringify(value).includes('private-link'))
  }
  assert.equal(JSON.stringify(document),before)
})

test('代码样式进入有界缩略图，隐藏属性不绘制，属性与源码不成为导航内容',()=>{
  const document=createDocument('slides','code-thumb'),page=createPage('code-thumb-page')
  page.nodes.visible={...createNode('text','visible'),text:'可见中文',css:{filter:'blur(1px) !important'}}
  page.nodes.hidden={...createNode('text','hidden'),text:'隐藏中文',attributes:{hidden:''}}
  page.nodeOrder=['visible','hidden']
  const output=renderToStaticMarkup(createElement(PageThumbnail,{page,document,loaded:true}))
  assert.match(output,/<foreignObject/)
  assert.match(output,/filter:blur\(1px\)/)
  assert.match(output,/可见中文/)
  assert.doesNotMatch(output,/隐藏中文|href=|onclick=/)
})

test('thumbnail depicts node data and groups without editor, iframe or executable source', () => {
  const document = createDocument('slides', 'thumb-doc'), page = createPage('thumb-page')
  const group = { ...createNode('group', 'group'), x: 40, y: 50, rotation: 15 }
  const text = { ...createNode('text', 'text'), parentId: group.id, text: '<script>literal</script>' }
  const embed = { ...createNode('embed', 'embed'), embed: { source: '<script>alert(1)</script>', format: 'html' as const } }
  page.nodeOrder = [group.id, text.id, embed.id]; page.nodes = { group, text, embed }
  const output = renderToStaticMarkup(createElement(PageThumbnail, { page, document, loaded: true }))
  assert.match(output, /width="64" height="40"/)
  assert.match(output, /translate\(40 50\) rotate\(15/)
  assert.match(output, /&lt;script&gt;literal&lt;\/script&gt;/)
  assert.doesNotMatch(output, /<iframe|contenteditable|alert\(1\)/)
  assert.match(output, /aria-hidden="true"/)
})

test('unloaded page reuses its cached preview and immutable edits/theme changes refresh it', () => {
  const document = createDocument('slides', 'cache-doc'), page = createPage('cache-page')
  const node = { ...createNode('text', 'text'), text: 'Before', style: { themeColor: 'ink' } }
  document.themeId = 'theme'; document.themes.theme = { id: 'theme', name: 'Theme', tokens: { ink: '#123456' } }
  page.nodeOrder = [node.id]; page.nodes[node.id] = node
  const render = (value = page, loaded = true) => renderToStaticMarkup(createElement(PageThumbnail, { page: value, document, loaded }))
  assert.match(render(), /Before/)
  assert.match(render({ ...page, nodes: {}, nodeOrder: [] }, false), /Before/)
  const changed = { ...page, nodes: { text: { ...node, text: 'After' } } }
  assert.match(render(changed), /After/)
  document.themes.theme = { ...document.themes.theme, tokens: { ink: '#654321' } }
  assert.match(render(changed), /fill="#654321"/)
  assert.doesNotMatch(render({ ...page, id: 'never-loaded', nodes: {}, nodeOrder: [] }, false), /Before|After/)
})

test('thumbnail DOM remains bounded for dense pages', () => {
  const document = createDocument('design', 'dense-doc'), page = createPage('dense-page')
  const group = createNode('group', 'group'); page.nodes.group = group; page.nodeOrder.push('group')
  for (let index = 0; index < 300; index++) { const node = { ...createNode('shape', `shape-${index}`), parentId: index < 150 ? group.id : null }; page.nodes[node.id] = node; page.nodeOrder.push(node.id) }
  const output = renderToStaticMarkup(createElement(PageThumbnail, { page, document, loaded: true }))
  assert.equal((output.match(/<g /g) ?? []).length, 96)
})

test('画板四角裁切背景和全部缩略内容，不改写节点',()=>{
  const document=createDocument('design','radius-thumb'),page=createPage('radius-page');page.radius=[10,20,30,40]
  const node={...createNode('shape','edge'),x:0,y:0,width:page.width,height:page.height,style:{fill:'#123456'}}
  page.nodes={edge:node};page.nodeOrder=['edge'];const before=JSON.stringify(page)
  const html=renderToStaticMarkup(createElement(PageThumbnail,{page,document,loaded:true}))
  assert.match(html,/<clipPath/);assert.match(html,/M10 0 H1260 A20 20/);assert.match(html,/<g clip-path="url\(#/)
  assert.equal(JSON.stringify(page),before)
})


test('标题缩略图保持默认粗体、显式普通与CSS字重优先级',()=>{
 const document=createDocument('design','weight-thumb'),page=createPage('weight-page'),node=createNode('text','heading')
 node.text='中文标题';node.richText={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:node.text}]}]};node.style={fontSize:48};page.nodes[node.id]=node;page.nodeOrder=[node.id];document.pages[page.id]=page;document.pageOrder=[page.id]
 const output=()=>renderToStaticMarkup(createElement(PageThumbnail,{page,document,loaded:true}))
 assert.match(output(),/<text[^>]+font-weight="700"/)
 const before=JSON.stringify(document),preview=artifactPreviews(document)[page.id];assert.match(renderToStaticMarkup(createElement(PageThumbnail,{page:preview,document,loaded:true})),/<text[^>]+font-weight="700"/);assert.equal(JSON.stringify(document),before)
 const plain={...page,nodes:{...page.nodes,heading:{...node,style:{...node.style,fontWeight:400}}}};assert.match(renderToStaticMarkup(createElement(PageThumbnail,{page:plain,document,loaded:true})),/<text[^>]+font-weight="400"/)
 const css={...page,nodes:{...page.nodes,heading:{...node,css:{'font-weight':'var(--weight,500)'}}}};const html=renderToStaticMarkup(createElement(PageThumbnail,{page:css,document,loaded:true}));assert.match(html,/font-weight:var\(--weight,500\)/);assert.doesNotMatch(html,/<text[^>]+font-weight=/)
})
