import ts from'typescript';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const m=JSON.parse(await readFile('server/assets/design-editor/manifest.json','utf8')),source=await readFile('server/assets/design-editor/'+m.entry.file,'utf8');const path='/entry.js',options={allowJs:true,noLib:true,noResolve:true,target:ts.ScriptTarget.ESNext},host=ts.createCompilerHost(options);host.getSourceFile=(name,version)=>name===path?ts.createSourceFile(name,source,version,true,ts.ScriptKind.JS):undefined;const program=ts.createProgram([path],options,host),tree=program.getSourceFile(path),checker=program.getTypeChecker();
function scan(n,f){f(n);ts.forEachChild(n,c=>scan(c,f))}
const keys=new Set(m.browserRuntime.receiverCalls),bindings=new Map(),assignments=new Map();
scan(tree,n=>{
 if(ts.isCallExpression(n)&&n.expression.getText(tree)==='t'&&ts.isStringLiteral(n.arguments[1])&&keys.has(n.arguments[1].text))bindings.set(n.arguments[1].text,n.arguments[2].body)
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken){
  if(ts.isPropertyAccessExpression(n.left)&&keys.has(n.left.name.text))bindings.set(n.left.name.text,n.right)
  if(ts.isIdentifier(n.left)){const sym=checker.getSymbolAtLocation(n.left);let rows=assignments.get(sym);if(!rows)assignments.set(sym,rows=[]);rows.push(n.right)}
 }
});
const records=[]
for(const key of keys){
 const expression=bindings.get(key);if(!expression)throw Error('missing '+key)
 const declaration=checker.getSymbolAtLocation(expression)?.valueDeclaration;const targets=[]
 const inspect=node=>{if(!node)return;if(ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node))targets.push(node)}
 inspect(declaration)
 if(declaration&&ts.isVariableDeclaration(declaration)){inspect(declaration.initializer);for(const rhs of assignments.get(checker.getSymbolAtLocation(declaration.name))??[])inspect(rhs)}
 if(!targets.length)throw Error('unresolved target '+key+' '+expression.getText(tree))
 records.push({key,expression:expression.getText(tree),targets:targets.map(target=>{let thisCount=0,evalCalls=0;scan(target,n=>{if(n.kind===ts.SyntaxKind.ThisKeyword)thisCount++;if(ts.isCallExpression(n)&&n.expression.getText(tree)==='eval')evalCalls++});return{kind:ts.SyntaxKind[target.kind],bytes:target.getText(tree).length,sha256:createHash('sha256').update(target.getText(tree)).digest('hex'),thisCount,evalCalls,source:target.getText(tree)}})})
}
const report={scope:'Eight direct receiver calls in pinned browser source: resolve native functions or initializer arrows and inspect their receiver use. Mutable alias setters are not a general future-source proof; final review must verify actual writers. Original source/functions are unchanged.',entry:m.entry.file,bindings:records}
await writeFile('.codex-tmp/issue-652/phase5/receiver-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(records.map(r=>({key:r.key,targets:r.targets.map(({source,...t})=>t)}))))
