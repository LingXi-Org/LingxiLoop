import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocument,createNode,createPage} from './artifact-document.js'
import {artifactFontFamilyCensus,documentFontFamilies,pageFontFamilies} from './artifact-font-families.js'

test('字体摘要独立于字号收集分组声明，保持作者内容和页面不可变',()=>{
 const doc=createDocument('design','字体摘要'),page=createPage('画板'),group=createNode('group','组合'),text=createNode('text','正文')
 group.style={fontFamily:'Georgia'};text.parentId=group.id;text.style={fontFamily:'Arial'};text.text='不进入摘要的作者内容';page.nodes={组合:group,正文:text};page.nodeOrder=['正文','组合'];doc.pages[page.id]=page;doc.pageOrder=[page.id]
 const before=JSON.stringify(doc)
 assert.deepEqual(pageFontFamilies(page,doc),{first:['Georgia','Arial'],display:['Georgia','Arial']})
 assert.deepEqual(artifactFontFamilyCensus(doc),{画板:{first:['Georgia','Arial'],display:['Georgia','Arial']}})
 assert.equal(JSON.stringify(doc),before);assert.ok(!JSON.stringify(artifactFontFamilyCensus(doc)).includes(text.text))
})

test('字体摘要读取实际CSS优先级与主题字体，显示名跳过通用/图标字体',()=>{
 const doc=createDocument('design','字体声明'),page=createPage('画板');doc.themeId='主题';doc.themes.主题={id:'主题',name:'中文主题',tokens:{'font.sans':'Inter'}}
 const values=[{style:{fontFamily:'Arial'},css:{'font-family':'"Georgia", serif !important'}},{style:{fontFamily:'system-ui, Arial, sans-serif'}},{style:{fontFamily:'Material Icons'}},{style:{themeFont:'font.sans',themeFontFallback:'sans-serif'}}]
 for(const [index,value]of values.entries()){const node={...createNode('text',String(index)),...value};page.nodes[node.id]=node;page.nodeOrder.push(node.id)}
 assert.deepEqual(pageFontFamilies(page,doc).display,['Georgia','Arial','Inter'])
})

test('当前画板字体优先，未加载摘要参与且本地加载页覆盖旧摘要，删除页不复活',()=>{
 const doc=createDocument('design','局部加载')
 for(const [id,font]of [['甲','Arial'],['乙','Georgia'],['丙','Roboto']]){const page=createPage(id),node=createNode('group',id+'组');node.style={fontFamily:font};page.nodes[node.id]=node;page.nodeOrder=[node.id];doc.pages[id]=page;doc.pageOrder.push(id)}
 const census=artifactFontFamilyCensus(doc);doc.pages.乙={...doc.pages.乙,nodes:{},nodeOrder:[]};doc.pageOrder=doc.pageOrder.filter(id=>id!=='丙');doc.pages.甲.nodes.甲组.style.fontFamily='Lato'
 assert.deepEqual(documentFontFamilies(doc,'乙',census,['甲']),['Georgia','Lato'])
 assert.deepEqual(documentFontFamilies(doc,'甲',census,['甲']),['Lato','Georgia'])
})
