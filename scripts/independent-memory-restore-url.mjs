// Pure isolation boundary. No network, credential loading or environment mutation.
import assert from 'node:assert/strict'
const ownedDatabase=/^restore216_[a-f0-9]{12}_(source|target)_test$/
function checkedURL(raw){
 let url
 try{url=new URL(raw)}catch{throw Error('invalid rehearsal URL')}
 assert.ok(url.protocol==='postgresql:','PostgreSQL URL required')
 assert.ok(url.hostname==='127.0.0.1','loopback host required')
 assert.ok(url.username==='postgres'&&url.password,'existing local test identity required')
 assert.ok(!url.search&&!url.hash,'URL query and fragment are forbidden')
 try{decodeURIComponent(url.password)}catch{throw Error('invalid local test password encoding')}
 return url
}
function checkPort(port){
 assert.ok(/^\d{1,5}$/.test(String(port))&&Number(port)>0&&Number(port)<=65535&&Number(port)!==55432,'owned non-shared port required')
}
export function parseRehearsalLocalURL(raw){
 const url=checkedURL(raw)
 assert.ok(url.pathname==='/postgres','local credential template database required')
 return url
}
export function ownedDatabaseURL(template,port,database){
 const input=parseRehearsalLocalURL(String(template))
 checkPort(port)
 assert.ok(database==='postgres'||ownedDatabase.test(database),'owned database name required')
 const url=new URL('postgresql://127.0.0.1')
 url.username='postgres';url.password=input.password;url.port=String(port);url.pathname='/'+database
 return url.href
}
export function parseOwnedDatabaseURL(raw){
 const url=checkedURL(raw)
 checkPort(url.port)
 assert.ok(ownedDatabase.test(url.pathname.slice(1)),'owned subprocess database required')
 return url
}
