import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {profileOpeningChunks,openingModuleRoles,assertNativeConversationIsolation} from './native-artifact-bundle-profile.mjs'
const chunk=(fileName,imports,modules,code='export const value=1;')=>({type:'chunk',fileName,imports,modules,code})
test('native opening rejects co-located conversation UI but allows lazy comments',()=>{
 const bundle={
  'native.js':{...chunk('native.js',['thread.js'],{}),dynamicImports:['comments.js']},
  'thread.js':chunk('thread.js',[],{'/repo/src/features/chat/components/ConversationThread.tsx':{renderedLength:30},'/repo/node_modules/lucide-react/dist/esm/icons/bot.mjs':{renderedLength:10}}),
  'comments.js':chunk('comments.js',[],{'/repo/src/features/artifacts/native/CommentsPanel.tsx':{renderedLength:40}}),
 }
 assert.throws(()=>assertNativeConversationIsolation(profileOpeningChunks(bundle,[],['native.js'],'/repo')),/会话界面/)
 bundle['native.js'].imports=[]
 assert.doesNotThrow(()=>assertNativeConversationIsolation(profileOpeningChunks(bundle,[],['native.js'],'/repo')))
})
test('opening profile subtracts warm application chunks and includes the text editor only once',()=>{
 const bundle={
  'app.js':chunk('app.js',['common.js'],{'/repo/src/App.tsx':{renderedLength:10,originalLength:20}}),
  'common.js':chunk('common.js',[],{'/repo/node_modules/react/index.js':{renderedLength:20,originalLength:40}}),
  'native.js':chunk('native.js',['common.js'],{'/repo/src/features/artifacts/native/NativeEditor.tsx':{renderedLength:100,originalLength:200}}),
  'text.js':chunk('text.js',['common.js'],{'/repo/src/features/artifacts/native/RichTextEditor.tsx':{renderedLength:30,originalLength:60}}),
  'export.js':chunk('export.js',[],{'/repo/src/features/artifacts/native/export/pptx.ts':{renderedLength:900,originalLength:1000}}),
 }
 const report=profileOpeningChunks(bundle,['app.js'],['native.js','text.js'],'/repo')
 assert.deepEqual(report.nativeIncremental.chunks,['native.js','text.js'])
 assert.equal(report.nativeIncremental.modules.length,2)
 assert.ok(report.nativeIncremental.gzipBytes>0)
 assert.ok(!JSON.stringify(report).includes('pptx.ts'))
})
test('profile exposes module sizes and project paths, without code or private package file names',()=>{
 const bundle={'native.js':chunk('native.js',[],{
  '/repo/src/features/artifacts/native/NativeEditor.tsx':{renderedLength:100,originalLength:200,code:'DO_NOT_EXPORT_MODULE_SOURCE'},
  '/repo/node_modules/@lingxi-org/lingxios/dist/private-entry.js':{renderedLength:20,originalLength:40,code:'DO_NOT_EXPORT_RUNTIME_SOURCE'},
  '\0internal-helper':{renderedLength:5,originalLength:10},
 })}
 const report=profileOpeningChunks(bundle,[],['native.js'],'/repo'),json=JSON.stringify(report)
 assert.equal(report.nativeIncremental.modules.find(item=>item.label==='dependency:@lingxi-org/lingxios').renderedCodeUnits,20)
 assert.ok(!json.includes('DO_NOT_EXPORT'));assert.ok(!json.includes('private-entry'));assert.ok(!json.includes('/repo/'))
 assert.equal(report.qualified,false)
})

test('every actual boot preload is subtracted as an application root',()=>{
 const config=readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8'),declaration=config.match(/const BOOT_ROUTE_MODULES = (\[[^\n]+\])/);assert.ok(declaration)
 const modules=JSON.parse(declaration[1].replaceAll("'",'"'))
 for(const module of modules)assert.ok(openingModuleRoles.application.includes('/'+module),`Missing actual warm boot root: ${module}`)
})

test('chunk ownership separates static edges, lazy routes and co-located project utilities',()=>{
 const bundle={
  'native.js':{...chunk('native.js',['thread.js'],{'/repo/src/features/artifacts/native/NativeEditor.tsx':{renderedLength:100,originalLength:200}}),dynamicImports:['comments.js'],isDynamicEntry:true},
  'thread.js':chunk('thread.js',[],{'/repo/src/features/chat/components/ConversationThread.tsx':{renderedLength:90,originalLength:120},'/repo/src/lib/shared.ts':{renderedLength:10,originalLength:20},'/repo/node_modules/lexical/private.js':{renderedLength:30,originalLength:40}}),
  'comments.js':chunk('comments.js',[],{'/repo/src/features/artifacts/native/CommentsPanel.tsx':{renderedLength:10,originalLength:20}}),
 }
 const profile=profileOpeningChunks(bundle,[],['native.js'],'/repo'),details=profile.nativeIncremental.chunkDetails
 assert.deepEqual(details.find(item=>item.fileName==='native.js').imports,['thread.js'])
 assert.deepEqual(details.find(item=>item.fileName==='native.js').dynamicImports,['comments.js'])
 assert.equal(details.find(item=>item.fileName==='native.js').isDynamicEntry,true)
 assert.deepEqual(details.find(item=>item.fileName==='thread.js').projectModules,['src/features/chat/components/ConversationThread.tsx','src/lib/shared.ts'])
 assert.equal(details.find(item=>item.fileName==='thread.js').dependencyPackages[0].label,'dependency:lexical')
 assert.ok(!JSON.stringify(profile).includes('private.js'))
})


test('binding counts distinguish hoisted edges and expose only allowlisted public module metadata',()=>{
 const bundle={
  'native.js':{...chunk('native.js',['thread.js','hoisted.js'],{
   '/repo/node_modules/lucide-react/dist/esm/icons/align-left.mjs':{renderedLength:17,originalLength:30,renderedExports:['AlignLeft']},
   '/repo/node_modules/zustand/esm/react.mjs':{renderedLength:18,originalLength:31,renderedExports:['useStore']},
   '/repo/node_modules/zod/v4/core/index.js':{renderedLength:19,originalLength:32,renderedExports:['parse']},
   '/repo/node_modules/@lingxi-org/lingxios/dist/private-entry.js':{renderedLength:20,originalLength:33,renderedExports:['PRIVATE_EXPORT']},
  }),importedBindings:{'thread.js':['publicAlias','otherAlias']}},
  'thread.js':chunk('thread.js',[],{}),
  'hoisted.js':chunk('hoisted.js',[],{}),
 }
 const report=profileOpeningChunks(bundle,[],['native.js'],'/repo'),row=report.nativeIncremental.chunkDetails.find(item=>item.fileName==='native.js')
 assert.deepEqual(row.staticImportBindings,[{fileName:'thread.js',importedBindingCount:2},{fileName:'hoisted.js',importedBindingCount:0}])
 assert.deepEqual(row.publicDependencyModules.map(item=>item.packageName).sort(),['lucide-react','zod','zustand'])
 assert.deepEqual(row.publicDependencyModules.find(item=>item.packageName==='lucide-react'),{packageName:'lucide-react',packageRelativeModulePath:'dist/esm/icons/align-left.mjs',renderedCodeUnits:17,renderedExports:['AlignLeft']})
 assert.ok(!JSON.stringify(report).includes('PRIVATE_EXPORT'))
 assert.ok(!JSON.stringify(report).includes('private-entry'))
 assert.ok(!JSON.stringify(report).includes('/repo/'))
})
