import {createRequire} from 'node:module'
import {test} from 'node:test'
import assert from 'node:assert/strict'
const require=createRequire('/workspace/LingxiLoop-independent-restore/package.json')
const {parse}=require('pg-connection-string')
// Exact prior validation/construction operations; parser only, no pg client/socket.
for(const query of ['?port=55432','?host=other.invalid']) test(`old guard cannot retain ${query.split('=')[0]}`,()=>{
 const input=new URL('postgresql://postgres:synthetic@127.0.0.1:55432/postgres'+query)
 assert.equal(input.hostname,'127.0.0.1');assert.equal(input.username,'postgres');assert.equal(input.pathname,'/postgres');assert.ok(input.password)
 const url=new URL(input);url.port='54399';url.pathname='/restore216_aabbccddeeff_target_test'
 assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'55432')
 const parsed=parse(url.href)
 assert.equal(parsed.host,'127.0.0.1');assert.equal(parsed.port,'54399')
})
