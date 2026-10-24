import express from 'express'
import { createHmac, randomUUID } from 'node:crypto'
import { pool, closeDatabasePools } from '../server/src/db/pool.js'
import { redis } from '../server/src/redis.js'
import { authMiddleware } from '../server/src/auth.js'
import { requireAuth } from '../server/src/http/request-context.js'
import { errorHandler } from '../server/src/http/errors.js'
import { safe } from '../server/src/http/async-handler.js'
import { casesRouter } from '../server/src/modules/cases/router.js'
import { assertMigrationsCurrent } from '../server/src/db/migrate.js'
const companyId='fixtures-covers376-school', userId='fixtures-covers376-teacher'
const caseId='case-d98c448f-155e-4cdf-b2d4-0464fb2cf294'
if(process.env.NODE_ENV!=='test'||!new URL(process.env.DATABASE_URL!).pathname.endsWith('/covers376_20261024_test'))throw Error('dedicated local fixture only')
await assertMigrationsCurrent()
const app=express(), session=randomUUID()
app.get('/__cover-fixture/session',safe(async(_req,res)=>{
 const user=(await pool.query<{id:string;display_name:string;email:string}>('SELECT id,display_name,email FROM users WHERE id=$1',[userId])).rows[0]
 if(!user)throw Error('preserved fixture missing')
 res.cookie('cover376-fixture-session',session,{httpOnly:true,sameSite:'strict',path:'/'})
 res.json({user:{id:user.id,name:user.display_name,email:user.email},companyId,caseId})
}))
app.use((req,_res,next)=>{
 if(req.headers.cookie?.split(';').some(item=>item.trim()===`cover376-fixture-session=${session}`)){
  const assertion={appUserId:userId,authUserId:userId,authSessionIssuedAt:Date.now(),method:req.method,path:req.originalUrl,timestamp:Date.now(),nonce:randomUUID()}
  const payload=Buffer.from(JSON.stringify(assertion)).toString('base64url')
  req.headers['x-lingxiloop-gateway']=payload+'.'+createHmac('sha256',process.env.LINGXILOOP_GATEWAY_HMAC_SECRET!).update(payload).digest('base64url')
 }
 next()
})
app.use((req,res,next)=>{void authMiddleware(req,res,next).catch(next)})
app.get('/__cover-fixture/stats',safe(async(req,res)=>{
 if(requireAuth(req)!==userId)throw Error('unexpected fixture identity')
 const jobs=(await pool.query('SELECT id,generation,status,attempts FROM organization_case_cover_jobs WHERE company_id=$1 AND case_id=$2 ORDER BY id',[companyId,caseId])).rows
 const assets=(await pool.query('SELECT COUNT(*)::int AS count FROM organization_case_cover_assets WHERE company_id=$1 AND case_id=$2',[companyId,caseId])).rows[0]
 const calls=(await pool.query('SELECT COUNT(*)::int AS count FROM llm_calls WHERE company_id=$1',[companyId])).rows[0]
 res.json({companyId,userId,caseId,jobs,assets:assets.count,llmCalls:calls.count})
}))
// Read-only: no generator, worker admission, retry, upload or backfill endpoint.
app.use('/api',(req,res,next)=>{if(req.method!=='GET'){res.status(405).end();return}next()},casesRouter)
app.use(errorHandler)
const server=app.listen(5291,'127.0.0.1',()=>console.log('case-cover live read-only API ready on 127.0.0.1:5291'))
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>server.close(()=>{void Promise.all([closeDatabasePools(),redis.quit()]).finally(()=>process.exit())}))
