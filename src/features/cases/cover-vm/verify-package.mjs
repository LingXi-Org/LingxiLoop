// PENDING explicit one-action approval. Never imported by app code or tests.
// Reads the audited prebuilt packages, bundles with the existing esbuild, then
// runs ONLY the five literal synthetic VM programs below in a bounded child.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'

const audit = '/tmp/cover-vm-package-audit'
const manifestBytes = readFileSync(new URL('../../../../docs/evidence/issue-376/vm/package-manifest.json', import.meta.url))
if (createHash('sha256').update(manifestBytes).digest('hex') !== '1d6dec9799d2cc57135c45b3a6749e7b8706acc23239db90001f012fa7a8a420') throw Error('audit manifest changed')
const manifest = JSON.parse(manifestBytes)
for (const pkg of manifest) {
  if (pkg.version !== '0.32.0') throw Error('unexpected version')
  const base = join(audit, pkg.name.replace('@', '').replace('/', '-'))
  for (const file of pkg.files) {
    const path = resolve(base, file.path)
    if (!path.startsWith(`${base}/`)) throw Error('unexpected path')
    const bytes = readFileSync(path)
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error('package bytes changed')
  }
}
const core = join(audit, 'quickjs-emscripten-core/dist/index.mjs')
const variant = join(audit, 'jitl-quickjs-wasmfile-release-sync/dist')
const wasm = readFileSync(join(variant, 'emscripten-module.wasm'))
const source = `
import { newQuickJSWASMModuleFromVariant, newVariant } from ${JSON.stringify(core)};
import { QuickJSFFI } from ${JSON.stringify(join(variant, 'ffi.mjs'))};
import raw from ${JSON.stringify(join(variant, 'emscripten-module.browser.mjs'))};
globalThis.fetch = () => { throw Error('unexpected network attempt'); };
const binary = Uint8Array.from(atob(${JSON.stringify(wasm.toString('base64'))}), c => c.charCodeAt(0));
const module = await newQuickJSWASMModuleFromVariant(newVariant({type:'sync',importFFI:async()=>QuickJSFFI,importModuleLoader:async()=>raw},{
  wasmBinary: binary.buffer, wasmMemory: new WebAssembly.Memory({initial:256,maximum:1024}),
  emscriptenModule: {print:()=>{},printErr:()=>{}}
}));
const programs = [
 ['arithmetic','String(6*7)','42'],
 ['no host APIs','JSON.stringify([typeof fetch,typeof XMLHttpRequest,typeof WebSocket,typeof RTCPeerConnection,typeof document,typeof localStorage,typeof process,typeof require,typeof std,typeof os])',JSON.stringify(Array(10).fill('undefined'))],
 ['module loader disabled','import x from "node:fs"; export default x;',null],
 ['CPU bound','while(true){}',null],
 ['heap bound','(()=>{const a=[];for(;;)a.push(new Array(10000).fill(123));})()',null],
];
const expectedErrors = {
 'module loader disabled': ['ReferenceError', "could not load module 'node:fs'"],
 'CPU bound': ['InternalError', 'interrupted'],
 'heap bound': ['InternalError', 'out of memory'],
};
for (const [name,source,expected] of programs) {
 const runtime=module.newRuntime(); runtime.setMemoryLimit(8*1024*1024);runtime.setMaxStackSize(256*1024);runtime.removeModuleLoader();
 const deadline=Date.now()+250;let interrupts=0;runtime.setInterruptHandler(()=>++interrupts>5000||Date.now()>deadline);
 const context=runtime.newContext();let result;
 try {
  result=context.evalCode(source,'synthetic.js',name==='module loader disabled'?{type:'module'}:undefined);
  if(expected===null){
   if(!result.error)throw Error(name+' did not stop');
   // Only these fixed synthetic programs run. Keep their platform Error handle
   // inside the VM; copy bounded primitive strings, never dump/coerce an object.
   context.setProp(context.global,'__probeError',result.error);
   const inspectDeadline=Date.now()+50;let inspections=0;
   runtime.setInterruptHandler(()=>++inspections>500||Date.now()>inspectDeadline);
   const inspected=context.evalCode('(()=>{const e=globalThis.__probeError;const n=e.name,m=e.message;if(typeof n!=="string"||typeof m!=="string"||n.length>64||m.length>256)throw Error("invalid diagnostic");return JSON.stringify([n,m]);})()','diagnostic.js');
   try {
    if(inspected.error||context.typeof(inspected.value)!=='string')throw Error(name+' diagnostic failed');
    const actual=context.getString(inspected.value);
    if(actual.length>2048||actual!==JSON.stringify(expectedErrors[name]))throw Error(name+' unexpected error category');
   } finally {if(inspected.error)inspected.error.dispose();else inspected.value.dispose();}
  }
  else {if(result.error||context.getString(result.value)!==expected)throw Error(name+' mismatch');}
  console.log(JSON.stringify({name,pass:true}));
 } finally { if(result){if(result.error)result.error.dispose();else result.value.dispose();}context.dispose();runtime.dispose(); }
}
`
const bundle = buildSync({ stdin: { contents: source, resolveDir: audit, sourcefile: 'cover-vm-synthetic-probe.mjs' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent', alias: { '@jitl/quickjs-ffi-types': join(audit, 'jitl-quickjs-ffi-types/dist/index.mjs') } }).outputFiles[0].text
const cwd = mkdtempSync(join(tmpdir(), 'cover-vm-probe-'))
try {
  const result = spawnSync(process.execPath, ['--max-old-space-size=192', '--input-type=module'], { input: bundle, cwd, env: { PATH: '/usr/bin:/bin' }, timeout: 10000, maxBuffer: 131072, encoding: 'utf8' })
  process.stdout.write(result.stdout ?? '')
  if (result.error || result.status !== 0) { process.stderr.write(result.stderr ?? ''); throw Error(`VM probe failed: ${result.error?.message ?? result.status}`) }
} finally { rmSync(cwd, { recursive: true, force: true }) }
