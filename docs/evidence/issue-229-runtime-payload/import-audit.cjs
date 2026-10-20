const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2] || '.');
const ts=require(root+'/node_modules/typescript');
const pkg=JSON.parse(fs.readFileSync(root+'/server/package.json'));
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(/node_modules|__tests__|__integration__/.test(e.name)?[]:walk(path.join(p,e.name))):/\.(ts|tsx|mjs|cjs|js)$/.test(e.name)&&!e.name.includes('.test.')?[path.join(p,e.name)]:[])}
const files=walk(root+'/server'), cache=new Map(),bare=new Map(),dyn=[];
function info(file){if(cache.has(file))return cache.get(file);const src=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const specs=[];
function v(n){let x;if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)x=n.moduleSpecifier;
if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||n.expression.getText(src)==='require'||n.expression.getText(src)==='import.meta.resolve')){x=n.arguments[0];if(!x||!ts.isStringLiteralLike(x))dyn.push({file:path.relative(root,file),line:src.getLineAndCharacterOfPosition(n.getStart()).line+1,expr:n.getText(src)});}
if(x&&ts.isStringLiteralLike(x))specs.push({spec:x.text,line:src.getLineAndCharacterOfPosition(n.getStart()).line+1});ts.forEachChild(n,v)}v(src);cache.set(file,specs);return specs;}
for(const file of files)info(file);
function resolveRel(file,s){const p=path.resolve(path.dirname(file),s);return [p,p.replace(/\.js$/,'.ts'),p.replace(/\.js$/,'.tsx'),p+'.ts',p+'/index.ts'].find(x=>fs.existsSync(x)&&fs.statSync(x).isFile());}
const seen=new Set(),missing=[];function visit(f){if(seen.has(f))return;seen.add(f);for(const x of info(f)){if(x.spec.startsWith('.')){const q=resolveRel(f,x.spec);q?visit(q):missing.push({...x,file:path.relative(root,f)});}else if(!x.spec.startsWith('node:')){const name=x.spec.startsWith('@')?x.spec.split('/').slice(0,2).join('/'):x.spec.split('/')[0];if(!bare.has(name))bare.set(name,[]);bare.get(name).push({file:path.relative(root,f),...x});}}}
for(const e of ['server/src/bin/web.ts','server/src/bin/worker.ts','server/src/migrate-bin.ts','server/scripts/check-packaged-startup.mjs'])visit(root+'/'+e);
const allLingxi=[...cache].flatMap(([file,specs])=>specs.filter(x=>x.spec==='lingxiloop'||x.spec.startsWith('lingxiloop/')).map(x=>({file,...x})));
const out={repo:root,head:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),serverFilesScanned:files.length,entryClosureFiles:seen.size,nonliteralDynamicImports:dyn,unresolvedRelative:missing,lingxiloopConsumers:allLingxi,barePackages:Object.fromEntries([...bare].sort()),directDependencyNotInEntryClosure:Object.keys(pkg.dependencies).filter(k=>!bare.has(k))};
fs.writeFileSync(path.resolve(process.argv[3] || 'dependency-imports.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,barePackages:[...bare.keys()].sort()},null,2));
