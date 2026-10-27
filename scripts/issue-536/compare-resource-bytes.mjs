// Source-byte comparison only; this does not measure browser performance.
import {build} from 'esbuild'
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const base='40605b36690e911ef958a082286a0a78acaa2556'
const temporary=await mkdtemp(resolve(tmpdir(),'visualize-536-'))
for(const file of ['document.ts','bootstrap.ts'])await writeFile(resolve(temporary,file),execFileSync('git',['show',`${base}:src/features/chat/visualize/web/${file}`],{cwd:root}))
const manifest=JSON.parse(await readFile(`${root}/server/assets/visualize-runtime/manifest.json`,'utf8'))
const runtime=JSON.parse(await readFile(`${root}/third_party/zcode/skills/visualize/assets/runtime-manifest.json`,'utf8'))
const vendors=JSON.parse(await readFile(`${root}/third_party/zcode/skills/visualize/assets/vendor/manifest.json`,'utf8'))
const hashes=Object.fromEntries([...Object.entries(runtime.files).map(([name,data])=>[name,data.sha256]),...vendors.resources.map(data=>[`vendor/${data.file}`,data.sha256]),...Object.entries(manifest.files).map(([name,data])=>[name,data.sha256])])
const fragment=await readFile(`${root}/e2e/visualize/fixtures/performance-static.html`,'utf8')
const rows=[]
for(const [version,entry] of [['before',resolve(temporary,'document.ts')],['after',`${root}/src/features/chat/visualize/web/document.ts`]]){
 const result=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'raw',setup(build){build.onResolve({filter:/\?raw$/},args=>({path:args.path,namespace:'raw'}));build.onLoad({filter:/.*/,namespace:'raw'},async()=>({contents:`export default ${JSON.stringify(await readFile(`${root}/node_modules/html-to-image/dist/html-to-image.js`,'utf8'))}`,loader:'js'}))}}]})
 const path=resolve(temporary,`${version}.mjs`);await writeFile(path,result.outputFiles[0].text)
 const {buildWebDocument}=await import(pathToFileURL(path).href)
 const reads=[]
 const html=await buildWebDocument(fragment,null,async name=>{const file=['gen-ui.js','kit-tooltip.js','kit-carousel.js','capture.js'].includes(name)?`${root}/server/assets/visualize-runtime/${name}`:`${root}/third_party/zcode/skills/visualize/assets/${name}`;const text=await readFile(file,'utf8');reads.push({name,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});return text},hashes['visualize.html'],hashes,'https://app.test.invalid')
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([,attributes])=>!attributes.includes('application/json'))
 rows.push({version,reads,requiredResourceBytes:reads.reduce((sum,r)=>sum+r.bytes,0),documentBytes:Buffer.byteLength(html),inlineScriptBytes:scripts.reduce((sum,[,,source])=>sum+Buffer.byteLength(source),0),externalScripts:[...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map(m=>m[1])})
}
await writeFile(resolve(root,'docs/evidence/issue-536/resource-comparison.json'),JSON.stringify({base,fixturePath:'e2e/visualize/fixtures/performance-static.html',fixture:fragment,measurement:'source bytes, no browser, no compression, no paint/interaction timings',rows},null,2)+'\n')
console.log(JSON.stringify(rows.map(({version,requiredResourceBytes,documentBytes,inlineScriptBytes,externalScripts})=>({version,requiredResourceBytes,documentBytes,inlineScriptBytes,externalScripts}))))

await rm(temporary,{recursive:true,force:true})
