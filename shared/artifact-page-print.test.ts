import assert from 'node:assert/strict'
import test from 'node:test'
import {createPage} from './artifact-document.js'
import {artifactPrintMode,artifactPrintPaper,artifactPrintSheetHeight,inferArtifactPaper,localeArtifactPaper,canFitArtifactPageHeight,nextArtifactFitHeight} from './artifact-page-print.js'

test('显式打印分页不改画板尺寸，纸张按来源点数而非屏幕近似值计算',()=>{
  const page={...createPage('p'),width:1920,height:240,print:'flow' as const,paper:'A4' as const},before=JSON.stringify(page)
  assert.equal(artifactPrintSheetHeight(page),Math.round(1920*841.89/595.28))
  assert.equal(artifactPrintMode(page),'flow')
  assert.equal(artifactPrintSheetHeight({...page,print:'fixed'}),240)
  assert.equal(JSON.stringify(page),before)
})

test('旧原生增长稿保留原PDF分页及默认值，没有打印字段时不补写',()=>{
  const page={...createPage('p'),width:800,height:1000},before=JSON.stringify(page)
  assert.equal(artifactPrintMode(page),'fixed');assert.equal(artifactPrintSheetHeight(page),1000)
  assert.equal(artifactPrintSheetHeight({...page,sizing:'flow'}),1000)
  assert.equal(artifactPrintSheetHeight({...page,sizing:'flow',paper:'A4'}),800*1123/794)
  assert.equal(artifactPrintSheetHeight({...page,sizing:'flow',paper:'Letter'}),800*1056/816)
  assert.equal(artifactPrintMode({...page,sizing:'flow',print:'fixed'}),'fixed')
  assert.equal(JSON.stringify(page),before);assert.equal(Object.hasOwn(page,'print'),false)
})

test('未显式选择纸张时，尺寸推断优先于语言；中文地区默认A4',()=>{
  assert.equal(inferArtifactPaper({width:794,height:1600}),'A4')
  assert.equal(inferArtifactPaper({width:816,height:2000}),'Letter')
  assert.equal(inferArtifactPaper({width:1200,height:1200}),undefined)
  assert.equal(artifactPrintPaper({width:794,height:1600},['en-US']),'A4')
  assert.equal(artifactPrintPaper({width:1920,height:240},['zh-CN']),'A4')
  assert.equal(artifactPrintPaper({width:1920,height:240},['en-US']),'Letter')
  assert.equal(artifactPrintPaper({width:794,height:1600,paper:'Letter'},['zh-CN']),'Letter')
  assert.equal(localeArtifactPaper(['zh-Hans-CN']),'A4')
  assert.equal(localeArtifactPaper(['es-MX']),'Letter')
  assert.equal(localeArtifactPaper(['en']),'Letter')
  assert.equal(localeArtifactPaper([]),'A4')
})


test('普通固定画板只增长超过四像素，已适配和宽松画板不写历史',()=>{
  const page={...createPage('p'),width:1920,height:1080},before=JSON.stringify(page)
  for(const measured of [0,40,1080,1084])assert.equal(nextArtifactFitHeight(page,measured),undefined)
  assert.equal(nextArtifactFitHeight(page,1085),1085);assert.equal(nextArtifactFitHeight(page,10000),8000)
  assert.equal(nextArtifactFitHeight({...page,height:1400},1080),undefined)
  assert.equal(nextArtifactFitHeight({...page,height:8000},10000),undefined)
  assert.equal(nextArtifactFitHeight({...page,height:40},40),undefined)
  assert.equal(JSON.stringify(page),before)
})

test('流式、无框和已匹配纸张不提供普通高度适配入口',()=>{
  const page={...createPage('p'),width:1920,height:1080}
  assert.equal(canFitArtifactPageHeight(page),true)
  for(const other of [{...page,print:'flow' as const},{...page,sizing:'flow' as const},{...page,frameless:true},{...page,width:794}]){
    assert.equal(canFitArtifactPageHeight(other),false);assert.equal(nextArtifactFitHeight(other,5000),undefined)
  }
})
