import assert from 'node:assert/strict'
import test from 'node:test'
import {runInNewContext}from'node:vm'
import * as builder from './build-design-editor.mjs'
const helper='function t(e,a,n,u){Object.defineProperty(e,a,{enumerable:!0,configurable:!0,get:n,...u?{set:u}:{}})}'
const fixture=helper+`function one(e){let value;function used(){return value}function neverUsed(){throw Error('unread browser alias')}return t(e,'used',()=>used),t(e,'value',()=>value,v=>value=v),t(e,'debugOnly',()=>neverUsed),()=>{value=7}}
function two(e){return()=>{e.value=11;globalThis.answer=(0,e.used)()}}
function nW(){const a=Object.create(null);const n=[one(a),two(a)];for(const f of n)f();return a}nW();`

test('Design private namespace pruning retains native reads, setters and initialization order',async()=>{
 assert.equal(typeof builder.optimizeDesignBrowserRuntime,'function')
 const result=await builder.optimizeDesignBrowserRuntime(fixture,{expectedFactories:2})
 assert.equal(result.removedBindings,1);assert.ok(result.removedNames.includes('debugOnly'))
 assert.doesNotMatch(result.source,/t\(e,'debugOnly'/)
 assert.match(result.source,/function neverUsed\(\)/,'native function bodies/names are preserved')
 const before={},after={};runInNewContext(fixture,before);runInNewContext(result.source,after)
 assert.equal(before.answer,11);assert.equal(after.answer,before.answer)
})

test('Design refuses unreviewed private namespace and constructor access',async()=>{
 assert.equal(typeof builder.optimizeDesignBrowserRuntime,'function')
 for(const code of [fixture.replace('(0,e.used)()',"e['used']()"),fixture.replace('(0,e.used)()','e.used()'),fixture.replace('e.value=11;','globalThis.leaked=e;e.value=11;'),fixture.replace('e.value=11;',"eval('e.debugOnly');e.value=11;"),fixture.replace('e.value=11;',"(eval)('e.debugOnly');e.value=11;"),fixture.replace('}nW();','}globalThis.exposed=nW;nW();'),fixture.replace('}nW();','}globalThis.factory=one;nW();')])
  await assert.rejects(builder.optimizeDesignBrowserRuntime(code,{expectedFactories:2}),/private|namespace|constructor/i)
 await assert.rejects(builder.optimizeDesignBrowserRuntime(fixture,{expectedFactories:3}),/factory/i)
})
