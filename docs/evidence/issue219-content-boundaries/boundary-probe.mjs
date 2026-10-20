// Execute the actual production payload/SQL expressions and private serializer.
// No provider, authorization stub, SQL engine, or replacement application logic is used.
// This focused boundary probe does not claim complete effect/HTTP/PG acceptance.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { contentDocumentSchema } from '../../../server/src/modules/content-editor/contracts.ts'
const helperPath = 'server/src/modules/learning/homework-answer.ts'
const contracts = existsSync(helperPath) ? await import('../../../server/src/modules/learning/homework-answer.ts') : {}
const output = process.env.BOUNDARY_PROBE_OUTPUT
assert.ok(output, 'Use a unique evidence output directory');mkdirSync(output,{recursive:true})
const sources = {}, parsed = {}
for(const name of ['homework-effects','homework-application','homework-repository','homework-reporting']) {
 const path=`server/src/modules/learning/${name}.ts`,text=readFileSync(path,'utf8')
 sources[path]=createHash('sha256').update(text).digest('hex');parsed[name]=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true)
}
const find = (node, predicate) => {if(predicate(node))return node;return ts.forEachChild(node,child=>find(child,predicate))}
const fn = (name,method) => find(parsed[name],node=>ts.isFunctionDeclaration(node)&&node.name?.text===method)
const evaluate = (text, values={}) => {const globals={...contracts,...values};return Function(...Object.keys(globals),`return (${text})`)(...Object.values(globals))}
const compile = node => ts.transpileModule(node.getText().replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const answer={text:'CURRENT ANSWER B',links:['https://example.invalid/current'],attachments:[],editorDocument:contentDocumentSchema.parse({format:'blocknote',version:1,projection:'CURRENT ANSWER B',sections:['CURRENT ANSWER B'],legacyMarkdown:'PRIVATE ORIGINAL A',blocks:[{id:'current-paragraph',type:'paragraph',props:{textColor:'default',backgroundColor:'default',textAlignment:'left'},content:[{type:'text',text:'CURRENT ANSWER B',styles:{bold:true}}],children:[]}]})}
if(existsSync(helperPath)) sources[helperPath]=createHash('sha256').update(readFileSync(helperPath)).digest('hex')
const original=JSON.stringify(answer), counts=[]
const check=async(name,work)=>{try{await work();counts.push({name,status:'passed'})}catch(error){counts.push({name,status:'failed',error:error.message})}}
const current={text:answer.text,links:answer.links,attachments:answer.attachments}
const state={answer,homework_id:'synthetic-homework',answer_revision:2,evidence_revision:1,returned_at:null,returned_after_sequence:0}
await check('actual report payload and model serializer omit recovery/native state',async()=>{
 const call=find(parsed['homework-effects'],n=>ts.isCallExpression(n)&&n.expression.getText()==='modelJson'&&n.arguments[2]?.getText()==='effect.kind')
 assert.ok(call)
 const data=evaluate(call.arguments[4].getText(),{state,hw:{title:'Synthetic task',instructions:'Current instructions',criteria:['Current criterion']},messages:[],selectedIds:[],coverage:{},previous:{rows:[]},feedback:{rows:[]},taskMaterials:[],answerMaterials:[],isReport:true})
 let captured
 const model=Function(...Object.keys(contracts),'env','createChatCompletion',compile(fn('homework-effects','modelJson'))+';return modelJson')(...Object.values(contracts),{OPENAI_MODEL:'synthetic'},async(_context,request)=>{captured=request;return {choices:[{message:{content:'{}'},finish_reason:'stop'}]}})
 await model({companyId:'synthetic-company'},null,'homework.report','Synthetic prompt',data)
 writeFileSync(`${output}/model-payload.json`,JSON.stringify(captured,null,2))
 assert.deepEqual(JSON.parse(captured.messages[1].content).answer,current)
})
await check('actual submission INSERT snapshots current native document only',()=>{
 const call=find(parsed['homework-application'],n=>ts.isCallExpression(n)&&n.expression.getText()==='db.query'&&n.arguments[0]?.getText().includes('INSERT INTO homework_submissions'))
 assert.ok(call)
 const params=evaluate(call.arguments[1].getText(),{state,submission:'synthetic-submission',scope:{companyId:'synthetic-company',userId:'synthetic-user'},hw:{project_id:'synthetic-project',due_at:null},id:'synthetic-homework',version:1,data:{idempotencyKey:'synthetic-idempotency'},contentHash:'synthetic-hash',report:{id:'synthetic-report'},references:[]})
 const shared=JSON.parse(params[8]);writeFileSync(`${output}/submitted-answer.json`,JSON.stringify(shared,null,2))
 assert.equal(shared.editorDocument.legacyMarkdown,undefined);assert.deepEqual(shared.editorDocument.blocks,answer.editorDocument.blocks);assert.equal(shared.text,answer.text)
})
await check('actual submission repository hides old recovery metadata without mutating stored row',async()=>{
 const method=fn('homework-repository','homeworkSubmissions')
 const read=Function(...Object.keys(contracts),compile(method)+';return homeworkSubmissions')(...Object.values(contracts))
 const row={id:'old-submission',answer};let values
 const rows=await read({query:async(_sql,params)=>{values=params;return {rows:[row]}}},{company_id:'synthetic-company',id:'synthetic-homework'},'synthetic-user')
 assert.deepEqual(values,['synthetic-company','synthetic-homework','synthetic-user',0,null])
 assert.equal(rows[0].answer.editorDocument.legacyMarkdown,undefined);assert.deepEqual(rows[0].answer.editorDocument.blocks,answer.editorDocument.blocks)
 assert.equal(JSON.stringify(row.answer),original)
})
await check('actual learner answer text-tool projection omits private recovery',()=>{
 const method=fn('homework-reporting','learnerHomeworkRead')
 const clause=find(method,n=>ts.isCaseClause(n)&&n.expression.getText()==="'answer'")
 const assignment=find(clause,n=>ts.isBinaryExpression(n)&&n.left.getText()==='content')
 assert.deepEqual(evaluate(assignment.right.getText(),{state}),current)
})
await check('actual teacher answer text-tool projection omits native recovery',()=>{
 const method=fn('homework-reporting','teacherHomeworkOverview')
 const content=find(method,n=>ts.isVariableDeclaration(n)&&n.name.getText()==='content'&&n.initializer)
 assert.deepEqual(evaluate(content.initializer.getText(),{state:{manual_evidence:null},input:{section:'answer'},submitted:{answer},report:null}),current)
})
await check('private draft native content and legacy recovery are unchanged',()=>assert.equal(JSON.stringify(answer),original))
const result={base:'dc4bc88b81f0b9011c7540e4dc7f0889cab23778',sources,counts,passed:counts.filter(x=>x.status==='passed').length,failed:counts.filter(x=>x.status==='failed').length,limitations:['Actual source expressions/private serializer executed with synthetic inputs and capture sink','Repository query returns a synthetic old stored row; not live SQL or authorization acceptance','No complete effect worker, HTTP, provider or production calls']}
writeFileSync(`${output}/receipt.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=result.failed?1:0
