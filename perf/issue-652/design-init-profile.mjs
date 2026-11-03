/** Diagnostic copy only; never modifies the measured/product asset directory.
 * node perf/issue-652/design-init-profile.mjs <built Design> <new output>
 * Timers perturb execution. They attribute the native synchronous factory
 * registry; they are not cold-open acceptance or total main-thread CPU. */
import assert from 'node:assert/strict'
import {createHash}from'node:crypto'
import{cp,mkdir,readFile,writeFile}from'node:fs/promises'
import{resolve}from'node:path'
import{brotliCompressSync,constants,gzipSync}from'node:zlib'
import ts from'typescript'
const [input,output]=process.argv.slice(2).map(path=>resolve(path))
assert.ok(input&&output&&input!==output)
await mkdir(output) // Refuse to overwrite any existing product or evidence.
const manifest=JSON.parse(await readFile(resolve(input,'manifest.json'),'utf8'))
const original=await readFile(resolve(input,manifest.entry.file),'utf8')
const tree=ts.createSourceFile('entry.js',original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const boot=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='nW')
assert.ok(boot)
const edits=[],names=[]
function scan(node){
 if(ts.isArrayLiteralExpression(node)&&node.elements.length===663){
  for(const call of node.elements){assert.ok(ts.isCallExpression(call)&&ts.isIdentifier(call.expression));names.push(call.expression.text);edits.push([call.getStart(tree),call.end,`__lingxiMeasureFactory("install",${JSON.stringify(call.expression.text)},()=>${call.getText(tree)})`])}
 }
 if(ts.isCallExpression(node)&&node.expression.getText(tree)==='n[u]')edits.push([node.getStart(tree),node.end,'__lingxiMeasureFactory("initialize",__lingxiFactoryNames[u],()=>n[u]())'])
 if(ts.isCallExpression(node)&&node.expression.getText(tree)==='VO')edits.push([node.getStart(tree),node.end,'__lingxiMeasureFactory("libraries","VO",()=>VO(a))'])
 ts.forEachChild(node,scan)
}
scan(boot);assert.equal(names.length,663);assert.equal(edits.length,665)
let source=original
for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end)
source=`const __lingxiFactoryNames=${JSON.stringify(names)},__lingxiFactorySamples=[];globalThis.__lingxiDesignFactoryTimings={diagnostic:true,factoryCount:663,samples:__lingxiFactorySamples};function __lingxiMeasureFactory(phase,name,fn){const start=performance.now();try{return fn()}finally{__lingxiFactorySamples.push({phase,name,ms:performance.now()-start})}}\n`+source
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sri=bytes=>'sha256-'+createHash('sha256').update(bytes).digest('base64')
const file='assets/design-'+hash(source)+'.js',before=manifest.entry.file
await cp(input,output,{recursive:true})
await writeFile(resolve(output,file),source)
const br=brotliCompressSync(source,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}),gz=gzipSync(source,{level:9})
await writeFile(resolve(output,file+'.br'),br);await writeFile(resolve(output,file+'.gz'),gz)
const html=(await readFile(resolve(input,'index.html'),'utf8')).replace(before.slice(7),file.slice(7)).replace(sri(original),sri(source))
assert.ok(html.includes(file.slice(7))&&html.includes(sri(source)))
await writeFile(resolve(output,'index.html'),html)
manifest.diagnostic={purpose:'Native synchronous factory timing only; never cold acceptance',inputEntry:before,inputSha256:hash(original),factories:names}
manifest.entry.file=file;manifest.files[file]={bytes:Buffer.byteLength(source),sha256:hash(source)};manifest.compressed[file]={br:br.length,gzip:gz.length};manifest.files['index.html']={bytes:Buffer.byteLength(html),sha256:hash(html)}
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest.diagnostic))
