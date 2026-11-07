// 仅在独立参考环境执行固定发布包的纯纸张函数，不进入产品包。
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {localeArtifactPaper,inferArtifactPaper,artifactPrintPaper,artifactPrintSheetHeight,canFitArtifactPageHeight,nextArtifactFitHeight} from '../shared/artifact-page-print.ts'
const [path,output='/tmp/lingxi-page-print-oracle.json']=process.argv.slice(2)
assert.ok(path,'需要固定版本Design脚本路径')
const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex')
assert.equal(sha256,'2680772536cc2009f905e18926b1215008c3e5cd8dc2976d8fe93a8bed6eac08')
const source=bytes.toString('utf8'),start=source.indexOf('function K4('),end=source.indexOf('function $4(',start)
assert.ok(start>0&&end>start)
assert.ok(source.includes('Fe=8e3,We=Fe/2'),'固定来源的高度上限必须为8000')
const reference={PlatformFileContentLimit_6:8000},navigator={languages:['en-US'],language:'en-US'}
runInNewContext(source.slice(start,end)+'\nK4(e)()',{e:reference,navigator,t:(object,name,get)=>Object.defineProperty(object,name,{get})},{timeout:1000})
const normal=value=>value==='letter'?'Letter':value==='a4'?'A4':undefined
const languages=[[],['en'],['zh'],['zh-CN'],['en-US'],['en-GB'],['zh-Hans-CN'],['es_MX'],['en-Latn-CA'],['invalid','fr-FR'],['en','zh-CN'],['EN'],['fil-PH'],['fr-CA'],['es-VE'],['de-DE-x-test']]
for(const values of languages)assert.equal(localeArtifactPaper(values),normal(reference.inferLocalePaperSize(values)))
const sizes=[[1920,1080],[800,240],[794,1600],[816,1056],[595.28*96/72,1000],[1000,1000],[0,0],[-1,1]]
let seed=707
for(let i=0;i<100;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;sizes.push([120+seed/2**32*7880,120+(seed%5000)])}
let comparisons=languages.length
for(const [width,height] of sizes){
  assert.equal(inferArtifactPaper({width,height}),normal(reference.inferArtboardPaperSize({w:width,h:height})));comparisons++
  for(const paper of [undefined,'Letter','A4'])for(const values of languages){
    navigator.languages=values;navigator.language=values[0]??''
    const original={w:width,h:height,...(paper?{paper:paper==='A4'?'a4':'letter'}:{})}
    const actual=artifactPrintPaper({width,height,paper},values),expected=reference.getArtboardPaperSize(original)
    assert.equal(actual,normal(expected))
    assert.equal(artifactPrintSheetHeight({width,height,paper,print:'flow'},values),reference.paperHeightForWidth(width,expected));comparisons+=2
  }
}
for(const height of [40,120,240,1080,1100,1400,8000])for(const measured of [0,40,120,240,600,1080,1084,1085,1100,9000]){
  const original=reference.resolveMeasuredExportHeight(height,measured),page={width:1920,height,print:'fixed'}
  assert.equal(nextArtifactFitHeight(page,measured),typeof original==='number'?original:undefined);comparisons++
}
for(const [width,height]of sizes)for(const print of ['fixed','flow'])for(const frameless of [false,true]){
  assert.equal(canFitArtifactPageHeight({width,height,print,frameless}),reference.needsPagedExport({w:width,h:height,print,frameless}));comparisons++
}
const result={sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',sourceSha256:sha256,offsetUnit:'UTF-16 code units',module:{name:'K4',start,end,sha256:createHash('sha256').update(source.slice(start,end)).digest('hex')},comparedAssertions:comparisons,allEqual:true,scope:'只验证来源纸张推断、打印页高及普通高度适配资格/四像素增长规则；不代替UI、PDF内容、完整视觉或性能资格。',qualified:false}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
