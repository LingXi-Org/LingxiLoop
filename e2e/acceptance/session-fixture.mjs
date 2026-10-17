// Synthetic post-login fixture only: actual D1 session validation, signed
// gateway and product authorization still execute. This does not test captcha.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { serializeSignedCookie } from 'better-call'
const root = resolve(process.env.ACCEPTANCE_FIXTURE_ROOT ?? '.')
const state = resolve(root,'.e2e/control-state')
assert.ok(root.startsWith('/workspace/'),'Only the disposable cloud workspace is supported')
function sql(statement, parameters) {
  const script = `import json,sqlite3,sys,pathlib\nv=json.load(sys.stdin)\npaths=list(pathlib.Path(v['state']).rglob('*.sqlite'))\nfor path in paths:\n c=sqlite3.connect(path,timeout=10)\n if c.execute("SELECT name FROM sqlite_master WHERE name='session'").fetchone():\n  c.execute(v['sql'],v['parameters']);c.commit();c.close();break\n c.close()\nelse: raise RuntimeError('No disposable D1 session database')\n`
  const result = spawnSync('python3',['-c',script],{input:JSON.stringify({state,sql:statement,parameters}),encoding:'utf8'})
  assert.equal(result.status,0,'Disposable D1 fixture operation must succeed')
}
export async function mintSession(role='member') {
  assert.ok(['member','student'].includes(role))
  const token = randomUUID()+randomUUID(), id=randomUUID(), now=Math.floor(Date.now()/1000)
  sql('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)',[id,now+3600,token,now,now,`e2e-auth-${role}`])
  const serialized=await serializeSignedCookie('better-auth.session_token',token,'lingxiloop-e2e-local-auth-secret-000000001',{path:'/',httpOnly:true,sameSite:'lax'})
  return {id,cookie:{name:'better-auth.session_token',value:serialized.split(';')[0].slice('better-auth.session_token='.length),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}}
}
export function expireSession(id) { sql('UPDATE session SET expiresAt=? WHERE id=?',[Math.floor(Date.now()/1000)-60,id]) }

export async function messageFacts(text) {
  assert.match(text,/^SPA acceptance [a-f0-9-]+(?: next)?$/)
  const {Client}=await import('pg')
  const db=new Client({connectionString:'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_browser_test'})
  await db.connect()
  try {
    const {rows}=await db.query("SELECT client_nonce,channel_id,channel_type,user_id,status FROM im_send_acceptances WHERE company_id='e2e-school' AND payload->'content' @> jsonb_build_array(jsonb_build_object('type','text','text',$1::text))",[text])
    let imMessages=0
    for (const row of rows) {
      const response=await fetch('http://127.0.0.1:55001/channel/messagesync',{method:'POST',headers:{'content-type':'application/json',token:'e2e-local-token'},
        body:JSON.stringify({login_uid:row.user_id,channel_id:row.channel_id,channel_type:row.channel_type,start_message_seq:0,end_message_seq:0,limit:200,pull_mode:0}),signal:AbortSignal.timeout(10000)})
      assert.equal(response.status,200)
      const value=await response.json(), messages=Array.isArray(value)?value:value.messages??[]
      imMessages+=messages.filter(x=>x.client_msg_no===row.client_nonce).length
    }
    return {acceptances:rows.length,accepted:rows.filter(x=>x.status==='accepted').length,imMessages}
  } finally {await db.end()}
}
export function pauseTestDatabase(paused) {
  const result=spawnSync('docker',[paused?'pause':'unpause','lingxiloop-e2e-postgres-1'],{encoding:'utf8'})
  assert.equal(result.status,0,'Named disposable database pause/restore must succeed')
}
