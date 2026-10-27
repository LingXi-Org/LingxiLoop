// Source/compression bytes only; this does not measure browser performance.
import {build} from 'esbuild'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {gzipSync,brotliCompressSync} from 'node:zlib'
import {buildGuestRuntime} from '../build-visualize-runtime.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const base='40605b36690e911ef958a082286a0a78acaa2556',previous='6448a9c6943033e1185cc050a28713185258b054'
const temporary=await mkdtemp(resolve(tmpdir(),'visualize-536-'))
const manifest=JSON.parse(await readFile(`${root}/server/assets/visualize-runtime/manifest.json`,'utf8'))
const runtime=JSON.parse(await readFile(`${root}/third_party/zcode/skills/visualize/assets/runtime-manifest.json`,'utf8'))
const vendors=JSON.parse(await readFile(`${root}/third_party/zcode/skills/visualize/assets/vendor/manifest.json`,'utf8'))
const hashes=Object.fromEntries([...Object.entries(runtime.files).map(([name,data])=>[name,data.sha256]),...vendors.resources.map(data=>[`vendor/${data.file}`,data.sha256]),...Object.entries(manifest.files).map(([name,data])=>[name,data.sha256])])
const bytes=value=>{const buffer=Buffer.from(value);return {bytes:buffer.length,gzipBytes:gzipSync(buffer).length,brotliBytes:brotliCompressSync(buffer).length}}
const baseline=await buildGuestRuntime({slim:false,write:false}),originalRuntime=Buffer.from(baseline.outputFiles[0].contents)
if(createHash('sha256').update(originalRuntime).digest('hex')!=='647af698d4339e59e96acb9b86d8a8ae28f9e1b7bac0b3c8742da4e4b6091492')throw new Error('Historical guest bytes changed: use the exact qualified lock/toolchain')
const fragment=await readFile(`${root}/e2e/visualize/fixtures/performance-static.html`,'utf8')
const rows=[]
try {
for(const [version,ref] of [['original',base],['previous',previous],['after',null]]){
 const historical=new Map()
 if(ref)for(const file of ['document.ts','bootstrap.ts',...(ref===previous?['optional-kit.ts']:[])])historical.set(resolve(root,`src/features/chat/visualize/web/${file}`),execFileSync('git',['show',`${ref}:src/features/chat/visualize/web/${file}`],{cwd:root,encoding:'utf8'}))
 const result=await build({entryPoints:[resolve(root,'src/features/chat/visualize/web/document.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'historical-document',setup(builder){builder.onLoad({filter:/\.ts$/},({path})=>historical.has(path)?{contents:historical.get(path),loader:'ts'}:undefined)}},{name:'raw',setup(builder){builder.onResolve({filter:/\?raw$/},args=>({path:args.path,namespace:'raw'}));builder.onLoad({filter:/.*/,namespace:'raw'},async()=>({contents:`export default ${JSON.stringify(await readFile(`${root}/node_modules/html-to-image/dist/html-to-image.js`,'utf8'))}`,loader:'js'}))}}]})
 const path=resolve(temporary,`${version}.mjs`);await writeFile(path,result.outputFiles[0].text)
 const {buildWebDocument}=await import(pathToFileURL(path).href)
 const reads=[]
 const html=await buildWebDocument(fragment,null,async name=>{
   const file=['gen-ui.js','kit-tooltip.js','kit-carousel.js','kit-tabs.js','kit-icons.js','kit.css','capture.js'].includes(name)?`${root}/server/assets/visualize-runtime/${name}`:`${root}/third_party/zcode/skills/visualize/assets/${name}`
   const content=ref&&name==='gen-ui.js'?originalRuntime:await readFile(file)
   reads.push({name,...bytes(content),sha256:createHash('sha256').update(content).digest('hex')});return content.toString('utf8')
 },hashes['visualize.html'],hashes,'https://app.test.invalid')
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([,attributes])=>!attributes.includes('application/json'))
 rows.push({version,ref,reads,requiredResourceCount:reads.length,requiredResourceBytes:reads.reduce((sum,r)=>sum+r.bytes,0),requiredResourceGzipBytes:reads.reduce((sum,r)=>sum+r.gzipBytes,0),requiredResourceBrotliBytes:reads.reduce((sum,r)=>sum+r.brotliBytes,0),document:bytes(html),inlineScripts:bytes(scripts.map(([, ,source])=>source).join('')),externalScripts:[...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map(match=>match[1])})
}
const contributions=Object.fromEntries(Object.entries(Object.values(baseline.metafile.outputs)[0].inputs).filter(([,value])=>value.bytesInOutput>0).map(([name,value])=>[name,value.bytesInOutput]))
const sources=Object.fromEntries(['before','after'].map((version,index)=>{const values=index?manifest.contributions:contributions;return [version,{runtime:bytes(index?Buffer.from(''):originalRuntime),contributions:values,topContributors:Object.entries(values).sort((a,b)=>b[1]-a[1]).slice(0,15)}]}))
sources.after.runtime=bytes(await readFile(`${root}/server/assets/visualize-runtime/gen-ui.js`))
const icons=Object.fromEntries(await Promise.all([['full','third_party/zcode/skills/visualize/assets/vendor/lucide-1.17.0.js'],['subset','server/assets/visualize-runtime/kit-icons.js']].map(async([name,file])=>[name,{file,...bytes(await readFile(resolve(root,file)))}])))
await writeFile(resolve(root,'docs/evidence/issue-536/resource-comparison.json'),JSON.stringify({base,previous,fixturePath:'e2e/visualize/fixtures/performance-static.html',measurement:'deterministic source bytes; local Node gzip/Brotli defaults, not HTTP transfer or browser paint/interaction timings',rows},null,2)+'\n')
await writeFile(resolve(root,'docs/evidence/issue-536/dependency-audit.json'),JSON.stringify({sources,icons,zodNamespaceImports:manifest.adaptation.zodNamespaceImports},null,2)+'\n')
console.log(JSON.stringify(rows.map(({version,requiredResourceCount,requiredResourceBytes,requiredResourceGzipBytes,requiredResourceBrotliBytes,document,inlineScripts})=>({version,requiredResourceCount,requiredResourceBytes,requiredResourceGzipBytes,requiredResourceBrotliBytes,document,inlineScripts})),null,2))
} finally {await rm(temporary,{recursive:true,force:true})}
