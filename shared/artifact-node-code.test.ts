import assert from 'node:assert/strict'
import test from 'node:test'
import { isNativeCodeAttribute, isNativeCodeStyle } from './artifact-node-code'

test('代码样式保留浏览器声明但拒绝活动内容与声明注入',()=>{
  for(const [name,value] of [['filter','blur(1px)'],['max-width','1800px'],['--Brand','中文'],['background-image','url("https://example.test/p.png")']]) assert.equal(isNativeCodeStyle(name,value),true,`${name}: ${value}`)
  for(const [name,value] of [['behavior','url(test.htc)'],['-moz-binding','url(test.xml)'],['background','url(javascript:alert(1))'],['background','url("java\\73 cript:alert(1)")'],['width','expression(alert(1))'],['color','red;position:fixed'],['constructor','red']]) assert.equal(isNativeCodeStyle(name,value),false,`${name}: ${value}`)
})

test('代码属性使用原生数据与可访问属性；事件、隔离内容和编辑器内部属性不可注入',()=>{
  for(const [name,value] of [['data-label','中文测试'],['aria-label','中文说明'],['title','说明'],['href','https://example.test/'],['href','#page-one'],['hidden','']]) assert.equal(isNativeCodeAttribute(name,value),true,name)
  for(const [name,value] of [['onclick','alert(1)'],['srcdoc','<script>'],['style','color:red'],['data-node-id','another'],['data-native-target','another'],['href','javascript:alert(1)'],['href','java\nscript:alert(1)'],['href','//untrusted.test'],['target','popup']]) assert.equal(isNativeCodeAttribute(name,value),false,name)
})

test('页面、画板和运动身份由编辑器保留，粘贴声明不能覆盖评论与选择的定位标记',()=>{
  for(const name of ['data-page-id','data-artboard-id','data-motion-id','data-motion-root','data-canvas-page-id','data-page-target','data-save-state','data-revision'])assert.equal(isNativeCodeAttribute(name,'other'),false,name)
  assert.equal(isNativeCodeAttribute('data-page-name','作者自己的中文标签'),true)
})
