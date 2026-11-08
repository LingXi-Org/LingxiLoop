import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {nativeSharedIconChunk} from './native-artifact-shared-icons'

test('only the measured shared public icons receive an explicit chunk',()=>{
 for(const icon of ['bot','image','chevron-down','ellipsis','chevron-left','chevron-right','x']){
  assert.equal(nativeSharedIconChunk(`/repo/node_modules/lucide-react/dist/esm/icons/${icon}.mjs`),'artifact-shared-icons')
  assert.equal(nativeSharedIconChunk(`C:\\repo\\node_modules\\lucide-react\\dist\\esm\\icons\\${icon}.mjs`),'artifact-shared-icons')
 }
 for(const id of ['/repo/src/features/chat/ConversationThread.tsx','/repo/node_modules/react/index.js','/repo/node_modules/lucide-react/dist/esm/createLucideIcon.mjs','/repo/node_modules/lucide-react/dist/esm/icons/image-plus.mjs','/repo/node_modules/@lingxi-org/lingxios/dist/image.mjs','/repo/src/icons/bot.mjs'])assert.equal(nativeSharedIconChunk(id),undefined)
})

test('every measured native icon co-located along a forbidden UI path is isolated, including transitive paths',()=>{
 type Chunk={fileName:string;imports:string[];projectModules:string[];publicDependencyModules:{packageName:string;packageRelativeModulePath:string}[]}
 const evidence=new URL('../docs/evidence/issue-707/performance/',import.meta.url)
 const nativeModules=new Set(JSON.parse(readFileSync(new URL('shared-icon-consumers.json',evidence),'utf8')).lucideNamedImports.map((entry:{module:string})=>entry.module))
 for(const filename of ['static-profile-bb4107e1.json','static-profile-da2552a6.json']){
  const profile:{application:{chunkDetails:Chunk[]};nativeIncremental:{chunkDetails:Chunk[]}}=JSON.parse(readFileSync(new URL(filename,evidence),'utf8')).profiles[1]
  const chunks=new Map([...profile.application.chunkDetails,...profile.nativeIncremental.chunkDetails].map(chunk=>[chunk.fileName,chunk]))
  const forbidden=(name:string,seen=new Set<string>()):boolean=>{
   if(seen.has(name))return false;seen.add(name)
   const chunk=chunks.get(name);return !!chunk&&(chunk.projectModules.some(path=>path==='src/components/CodeBlock.tsx'||path==='src/features/chat/components/ConversationThread.tsx')||chunk.imports.some(target=>forbidden(target,seen)))
  }
  for(const [name,chunk]of chunks){
   if(chunk.projectModules.some(path=>path.startsWith('src/features/artifacts/native/'))||!forbidden(name))continue
   for(const module of chunk.publicDependencyModules)if(module.packageName==='lucide-react'&&nativeModules.has(module.packageRelativeModulePath))assert.equal(nativeSharedIconChunk('/repo/node_modules/lucide-react/'+module.packageRelativeModulePath),'artifact-shared-icons',`${filename}: ${name} still shares ${module.packageRelativeModulePath}`)
  }
 }
})

test('the measured close icon does not load an unrelated query library with native editing',()=>{
 const profile=JSON.parse(readFileSync(new URL('../docs/evidence/issue-707/performance/static-profile-8b3a1c6e.json',import.meta.url),'utf8')).profiles[1]
 const query=profile.nativeIncremental.chunkDetails.find((chunk:{publicDependencyModules:{packageName:string;packageRelativeModulePath:string}[]})=>chunk.publicDependencyModules.some(module=>module.packageName==='lucide-react'&&module.packageRelativeModulePath==='dist/esm/icons/x.mjs'))
 assert.ok(query.dependencyPackages.some((entry:{label:string})=>entry.label==='dependency:@tanstack/query-core'))
 assert.equal(nativeSharedIconChunk('/repo/node_modules/lucide-react/dist/esm/icons/x.mjs'),'artifact-shared-icons')
})
