import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
// All inputs are synthetic; no provider, database query, or production request.
// The imported server projection uses the same fake unit-test environment as run-tests.mjs.
Object.assign(process.env, { OPENAI_API_KEY:'unit-test-key', OPENAI_EMBEDDING_MODEL:'text-embedding-3-small', WUKONG_USER_TOKEN_SECRET:'unit-test-wukong-user-token-secret', DATABASE_URL:'postgres://unit-tests@127.0.0.1:5432/lingxiloop', REDIS_URL:'redis://127.0.0.1:6379', R2_ENDPOINT:'http://127.0.0.1:9000', R2_BUCKET:'unit-tests', R2_ACCESS_KEY_ID:'unit-test-key', R2_SECRET_ACCESS_KEY:'unit-test-secret', R2_PUBLIC_BASE:'https://assets.test.invalid', R2_URL_SIGNING_SECRET:'unit-test-signing-secret', LINGXILOOP_INVITE_BASE_URL:'https://app.test.invalid' })
const root=process.cwd(),load=(p:string)=>import(pathToFileURL(`${root}/${p}`).href)
const {createNativeMessage,nativeMessageSchema,nativeText}=await load('src/lib/nativeMessage.ts')
const {convertEnvelope,projectMessageGroups}=await load('src/features/chat/runtime/converter.ts')
const {applyRunSnapshot}=await load('src/features/chat/runtime/run-updates.ts')
const {EMPTY_CONVERSATION_CHAT_STATE,mergeCanonicalMessages}=await load('src/features/chat/runtime/store.ts')
const {projectReplyBranches}=await load('src/features/chat/runtime/reply-branches.ts')
const {RunStreamProjection}=await load('server/src/agent-runtime/assistant-transport.ts')
const optimized=existsSync(`${root}/src/features/chat/runtime/snapshot-publication.ts`)
const {decodeRunSnapshot,createSnapshotPublisher}=optimized?await load('src/features/chat/runtime/snapshot-publication.ts'):{}
const {createThreadProjector}=optimized?await load('src/features/chat/runtime/thread-projection.ts'):{}
const target={conversationId:'room',agentId:'agent',runId:'run'}, participants={},selections={}
const projection=new RunStreamProjection('run',true,{agentId:'agent'})
projection.advance({type:'state',state:{run:{id:'run',status:'leased',fence:1,requestVersion:1,resultId:null,resultFence:null,kind:'turn',attempts:1,createdAt:'2026-01-01T00:01:00Z',availableAt:'',heartbeatAt:null,lastProgressAt:null,goalOutcome:null,error:null},message:null,delivery:null}})
const source={version:3,purpose:'answer',requestVersion:1,fence:1,attemptId:'a',partId:'a:answer',partIndex:0,messageId:'answer:run:v1',segmentId:'a:answer',operation:'append',supersedes:[]}
const event=(seq:number,kind:string,data:unknown)=>projection.advance({type:'event',event:{runId:'run',seq,kind,stage:'delta',visibility:'user',data}})
event(1,'public.text.operation',source)
const frames=[]
for(let i=0;i<400;i++){event(i+2,'public.text.delta',{...source,chunkIndex:i,text:'有效解释正文。'});frames.push(projection.snapshot)}
const results=[]
for(const historyCount of [100,500]) {
 const history=mergeCanonicalMessages([],Array.from({length:historyCount},(_,i)=>convertEnvelope({channelId:'room',channelType:2,fromUid:`human-${i%2}`,messageId:`m${i}`,clientMsgNo:`m${i}`,messageSeq:i+1,timestamp:0,payload:createNativeMessage({id:`m${i}`,role:'user',createdAt:'2026-01-01T00:00:00Z',content:[{type:'text',text:'历史正文'.repeat(20)}]})},{participants,meId:'human-0'})))
 for(const mode of ['every-publication','frame-batched']) {
  let state={...EMPTY_CONVERSATION_CHAT_STATE,messages:history},publications=0
  const project=createThreadProjector?.((messages:any[])=>projectMessageGroups(messages))
  const receive=(snapshot:unknown)=>{state=applyRunSnapshot(state,target,snapshot);publications++; for(let i=0;i<2;i++){if(project)project(state.messages,participants,selections,null);else projectMessageGroups(projectReplyBranches(state.messages.map((m:any)=>m),selections))}}
  let callback:(()=>void)|undefined
  const publisher=optimized&&mode==='frame-batched'?createSnapshotPublisher(receive,new AbortController().signal,(e:unknown)=>{throw e},(cb:()=>void)=>{callback=cb;return()=>{callback=undefined}}):undefined
  const start=performance.now()
  for(let i=0;i<frames.length;i++) {
   const decoded=optimized?decodeRunSnapshot(frames[i],target):(nativeMessageSchema.parse(frames[i].message),frames[i])
   if(publisher){publisher.push(decoded);if(i%8===7)callback?.()}else receive(decoded)
  }
  publisher?.flush();publisher?.dispose()
  results.push({history:historyCount,chunks:frames.length,mode,ms:performance.now()-start,publications,historyRefsRetained:history.filter((m:any,i:number)=>m===state.messages[i]).length,finalChars:nativeText(state.messages.at(-1))})
  results.at(-1)!.finalChars=results.at(-1)!.finalChars.length
 }
}
console.log(JSON.stringify({node:process.version,optimized,notes:'CPU only; each simulated frame receives 8 chunks; 2 snapshot consumers; fixture generation excluded',results},null,2))
process.exit(0)
