import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {profileOpeningChunks,openingModuleRoles} from './native-artifact-bundle-profile.mjs'
const chunk=(fileName,imports,modules,code='export const value=1;')=>({type:'chunk',fileName,imports,modules,code})
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
