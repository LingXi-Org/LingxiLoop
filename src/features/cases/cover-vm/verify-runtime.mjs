// Qualification only. Not imported by app/tests. Execution needs its own reviewed
// action; the earlier verify-package.mjs authorization does not cover this file.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'
const audit = '/tmp/cover-vm-package-audit'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const vendor = join(root, 'server/src/modules/case-covers/vendor')
const manifest = JSON.parse(readFileSync(join(vendor, 'manifest.json'), 'utf8'))
const resource = name => {
  const path = `skills/hairline-create/${name}`, bytes = readFileSync(join(vendor, path))
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[path]) throw Error('upstream bytes changed')
  return bytes.toString('utf8')
}
const kernel = resource('kernel.js')
const wasm = readFileSync(join(audit, 'jitl-quickjs-wasmfile-release-sync/dist/emscripten-module.wasm'))
const programs = ['riffle', 'terrain'].map(name => ({ name, figure: resource(`examples/${name}.js`) }))
const source = `
import {createCoverVm} from ${JSON.stringify(join(root, 'src/features/cases/cover-vm/runtime.ts'))};
import rawModule from ${JSON.stringify(join(audit, 'jitl-quickjs-wasmfile-release-sync/dist/emscripten-module.browser.mjs'))};
import {coverFrameSvg} from ${JSON.stringify(join(root, 'src/features/cases/cover-vm/svg.ts'))};
const wasm=Uint8Array.from(atob(${JSON.stringify(wasm.toString('base64'))}),c=>c.charCodeAt(0)).buffer;
const kernel=${JSON.stringify(kernel)};
const program=figure=>JSON.stringify({version:2,engine:'quickjs-wasm',kernel,figure});
const assert=(ok,name)=>{if(!ok)throw Error(name);};
for(const {name,figure} of ${JSON.stringify(programs)}){
 const vm=await createCoverVm(wasm,program(figure),rawModule);
 try{
  const initial=vm.step({type:'tick',delta:0});
  const svg=coverFrameSvg(initial);
  assert(svg.includes('<path'),'missing geometry');
  let changed=false;
  for(const [x,y] of [[128,150],[200,160],[272,150]]){
   vm.step({type:'pointer',kind:'pointermove',x,y,pointerType:'mouse'});
   for(let n=0;n<8;n++)changed ||= JSON.stringify(JSON.parse(vm.step({type:'tick',delta:33})).root)!==JSON.stringify(JSON.parse(initial).root);
  }
  assert(changed,'pointer did not change geometry');
  console.log(JSON.stringify({name,pass:true,svgBytes:svg.length,nodes:JSON.stringify(JSON.parse(initial).root).length}));
 }finally{vm.dispose();}
}
const base='hairline({range:[0,1,2],mount:({svg,stage})=>{HL.mk("path",{d:"M0 0L20 20"},svg);BODY;return {destroy(){}}}})';
const denied=[
 ['cpu','for(;;){}'],
 ['heap','const a=[];for(;;)a.push(new Array(10000).fill(1))'],
 ['external SVG','svg.attrs.onclick="bad"'],
 ['oversize output','JSON.stringify=()=>"x".repeat(300000)'],
 ['module load','import("node:fs").then(()=>{})'],
];
for(const [name,body] of denied){
 let failed=false,vm;
 try{vm=await createCoverVm(wasm,program(base.replace('BODY',body)),rawModule);}catch{failed=true;}finally{vm?.dispose();}
 assert(failed,name+' was accepted'); console.log(JSON.stringify({name,pass:true}));
}
const invisible='if([typeof fetch,typeof XMLHttpRequest,typeof WebSocket,typeof RTCPeerConnection,typeof process,typeof require,typeof std,typeof os].some(x=>x!=="undefined"))throw Error("host API exposed")';
const vm=await createCoverVm(wasm,program(base.replace('BODY',invisible)),rawModule);vm.dispose();console.log(JSON.stringify({name:'no host API',pass:true}));
`
const aliases = { 'quickjs-emscripten-core': join(audit,'quickjs-emscripten-core/dist/index.mjs'), '@jitl/quickjs-ffi-types':join(audit,'jitl-quickjs-ffi-types/dist/index.mjs'), '@jitl/quickjs-wasmfile-release-sync/ffi':join(audit,'jitl-quickjs-wasmfile-release-sync/dist/ffi.mjs'), '@jitl/quickjs-wasmfile-release-sync/emscripten-module':join(audit,'jitl-quickjs-wasmfile-release-sync/dist/emscripten-module.browser.mjs') }
const bundle=buildSync({stdin:{contents:source,sourcefile:'cover-vm-runtime-qualification.mjs',resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',alias:aliases,logLevel:'silent'}).outputFiles[0].text
const cwd=mkdtempSync(join(tmpdir(),'cover-vm-runtime-'))
try {
 const result=spawnSync(process.execPath,['--max-old-space-size=192','--input-type=module'],{input:bundle,cwd,env:{PATH:'/usr/bin:/bin'},timeout:10000,maxBuffer:131072,encoding:'utf8'})
 process.stdout.write(result.stdout??'')
 if(result.error||result.status!==0){process.stderr.write(result.stderr??'');throw Error('VM runtime qualification failed')}
}finally{rmSync(cwd,{recursive:true,force:true})}
