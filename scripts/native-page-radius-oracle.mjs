// Pure reference execution only; no published editor executable enters the product.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {normalizePageRadius,pageRadiusCss} from '../shared/artifact-page-radius.ts'

const [path,output='/tmp/lingxi-page-radius-oracle.json']=process.argv.slice(2)
assert.ok(path,'需要固定版本Design脚本路径')
const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex')
assert.equal(sha256,'2680772536cc2009f905e18926b1215008c3e5cd8dc2976d8fe93a8bed6eac08')
const source=bytes.toString('utf8')
assert.ok(source.includes('Fe=8e3,We=Fe/2'),'固定来源的圆角上限必须仍为4000')
const extract=(name,next)=>{const start=source.indexOf(`function ${name}(`),end=source.indexOf(`function ${next}(`,start);assert.ok(start>0&&end>start);return{start,end,text:source.slice(start,end)}}
const normalize=extract('Gs','ai'),css=extract('Ws','hs')
const reference=runInNewContext(`${normalize.text}\n${css.text}\n({normalize:Gs,css:Ws})`,{Qe:(value,min,max)=>Math.max(min,Math.min(max,value)),We:4000},{timeout:1000})
const inputs=[undefined,null,0,-1,4001,12.345,10,[0,0,0,0],[20,20,20,20],[10,20,30,40],[12.344,5,6,7],[8,-1,5000,0],[1,2,3],[1,2,3,4,5],['10',20,30,40],NaN,Infinity,{tl:1}]
let seed=707;const number=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32*8000-2000}
for(let i=0;i<100;i++)inputs.push(number(),[number(),number(),number(),number()])
const plain=value=>value===undefined?null:JSON.parse(JSON.stringify(value))
for(const value of inputs){assert.deepEqual(plain(normalizePageRadius(value)),plain(reference.normalize(value)));assert.equal(pageRadiusCss(value),reference.css(value))}
const result={sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',sourceSha256:sha256,offsetUnit:'UTF-16 code units',functions:[normalize,css].map(({start,end,text})=>({start,end,sha256:createHash('sha256').update(text).digest('hex')})),comparedInputs:inputs.length,allEqual:true,maximum:4000,decimals:2,scope:'只验证固定原版纯圆角归一化与CSS文本；不代表全部视觉、UI持久化或性能资格。',qualified:false}
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
