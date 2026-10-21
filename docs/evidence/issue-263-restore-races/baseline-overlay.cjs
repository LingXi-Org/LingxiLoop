const fs=require('node:fs'),cp=require('node:child_process'),{fileURLToPath}=require('node:url');
const root=process.cwd(),head='aac9d745140cd0243e530351039b557537d60da3';
const targets=['src/features/settings/store.ts','src/features/settings/RemovedConversationsSettings.tsx','src/features/conversations/store.ts'];
const sources=new Map(targets.map(p=>[root+'/'+p,cp.execFileSync('git',['-C',root,'show',head+':'+p])]));
const original=fs.readFileSync;
fs.readFileSync=function(file,options){const key=file instanceof URL?fileURLToPath(file):String(file);if(!sources.has(key))return original.apply(this,arguments);const b=sources.get(key);return typeof options==='string'?b.toString(options):options?.encoding?b.toString(options.encoding):Buffer.from(b);};
require('node:module').syncBuiltinESMExports();
