import assert from 'node:assert/strict'
import {test} from 'node:test'
import {parse} from 'pg-connection-string'
import {parseRehearsalLocalURL,ownedDatabaseURL,parseOwnedDatabaseURL} from './independent-memory-restore-url.mjs'
const template='postgresql://postgres:synthetic%40%3F%23%25@127.0.0.1:55432/postgres'
const database='restore216_aabbccddeeff_target_test'
test('pg parser sees only the reconstructed owned endpoint and original synthetic password',()=>{
 const url=ownedDatabaseURL(parseRehearsalLocalURL(template),'54399',database),config=parse(url)
 assert.equal(config.host,'127.0.0.1');assert.equal(config.port,'54399');assert.equal(config.user,'postgres')
 assert.equal(config.database,database);assert.equal(config.password,'synthetic@?#%')
 assert.equal(parseOwnedDatabaseURL(url).search,'');assert.equal(new URL(url).hash,'')
 assert.equal(parse(ownedDatabaseURL(template,54399,'postgres')).database,'postgres')
})
test('both entry points reject every query override or fragment without a connection',()=>{
 const owned=ownedDatabaseURL(template,54399,database)
 for(const suffix of ['?port=55432','?host=other.invalid','?user=other','?database=postgres','?sslmode=require','#fragment']){
  assert.throws(()=>parseRehearsalLocalURL(template+suffix))
  assert.throws(()=>ownedDatabaseURL(template+suffix,54399,database))
  assert.throws(()=>parseOwnedDatabaseURL(owned+suffix))
 }
})
test('construction and subprocess reject shared ports, foreign database, host and scheme',()=>{
 for(const port of [55432,0,65536,'NaN','54399?host=other.invalid']) assert.throws(()=>ownedDatabaseURL(template,port,database))
 for(const name of ['foreign','restore216_aabbccddeeff_target_test?port=55432'])assert.throws(()=>ownedDatabaseURL(template,54399,name))
 assert.throws(()=>parseOwnedDatabaseURL(ownedDatabaseURL(template,54399,'postgres')))
 const owned=ownedDatabaseURL(template,54399,database)
 for(const raw of [owned.replace(':54399/',':55432/'),owned.replace('127.0.0.1','other.invalid'),owned.replace('postgresql:','https:')])assert.throws(()=>parseOwnedDatabaseURL(raw))
})
