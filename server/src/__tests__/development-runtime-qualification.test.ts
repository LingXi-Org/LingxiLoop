import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Pool } from 'pg'
import { assertDevelopmentQualification, createDevelopmentRuntimeQualification, developmentPoolFingerprint, type DevelopmentRuntimeQualification } from '../db/development-runtime-qualification.js'
import { loadLockedRuntimePackage } from '../db/runtime-profile.js'
import { migrateDatabase, assertMigrationsCurrent } from '../db/migrate.js'

const forged={} as DevelopmentRuntimeQualification
const pool=new Pool({connectionString:'postgres://fixture@127.0.0.1:18438/runtime342_dev_aaaaaaaaaaaa_bbbbbbbbbbbb_test'})

test('a fabricated development token cannot replace the formal package proof',async()=>{
  assert.throws(()=>assertDevelopmentQualification(forged,pool,new URL('../db/migrations/',import.meta.url),true),/unverified development/)
  await assert.rejects(migrateDatabase(pool,undefined,forged),/unverified development/)
  await assert.rejects(assertMigrationsCurrent(pool,undefined,forged),/unverified development/)
  assert.equal(pool.totalCount,0,'All failures must precede database connection')
})

test('development factory rejects non-test mode before reading arbitrary files',async()=>{
  const previous=process.env.NODE_ENV
  try {
    for(const mode of ['production','development',undefined]) {
      if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode
      await assert.rejects(createDevelopmentRuntimeQualification(pool,{verifierPath:'/absent',inputsPath:'/absent',inputsSha256:'0'.repeat(64)}),/test mode/)
    }
  } finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous}
  assert.equal(pool.totalCount,0)
})

test('caller-authored verifier or success JSON cannot mint a token',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'untrusted-development-proof-')), previous=process.env.NODE_ENV
  try {
    process.env.NODE_ENV='test'
    const verifierPath=join(directory,'development-preflight.py'),inputsPath=join(directory,'inputs.json')
    await writeFile(verifierPath,"raise Exception('must never execute this untrusted verifier')\n")
    await writeFile(inputsPath,JSON.stringify({qualificationType:'development',published:false,releaseEligible:false,success:true}))
    await assert.rejects(createDevelopmentRuntimeQualification(pool,{verifierPath,inputsPath,inputsSha256:'0'.repeat(64)}),/sealed offline verifier/)
    assert.equal(pool.totalCount,0)
  } finally {if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;await rm(directory,{recursive:true,force:true})}
})

test('default formal lock path remains independent of development package identity',async()=>{
  const { releaseVersions }=await import('@lyyzka/lingxios')
  const locked=JSON.parse(await readFile(new URL('../../../package-lock.json',import.meta.url),'utf8')).packages['node_modules/@lyyzka/lingxios'].version
  if(releaseVersions.runtime!==locked)await assert.rejects(loadLockedRuntimePackage(),/exact formal runtime package/)
  else await loadLockedRuntimePackage()
})

test('actual Pool scope rejects foreign hosts, query overrides and custom transports before connecting',()=>{
  const previous=process.env.NODE_ENV;process.env.NODE_ENV='test'
  const name='runtime342_dev_aaaaaaaaaaaa_bbbbbbbbbbbb_test'
  try {
    const first=developmentPoolFingerprint(pool,name)
    for(const options of [
      {connectionString:'postgres://fixture@example.com:18438/'+name},
      {connectionString:'postgres://fixture@127.0.0.1:18438/'+name+'?host=example.com'},
      {connectionString:pool.options.connectionString,host:'example.com'},
      {connectionString:pool.options.connectionString,database:'other_test'},
      {connectionString:pool.options.connectionString,port:5432},
      {connectionString:pool.options.connectionString,stream:()=>{}},
      {connectionString:pool.options.connectionString,connection:{}},
      {connectionString:pool.options.connectionString,Client:class {}},
    ]){
      const other=new Pool({connectionString:pool.options.connectionString})
      Object.assign(other.options,options)
      assert.throws(()=>developmentPoolFingerprint(other,name),/exact local test Pool/)
      assert.equal(other.totalCount,0)
    }
    pool.options.host='example.com'
    assert.throws(()=>developmentPoolFingerprint(pool,name),/exact local test Pool/)
    delete pool.options.host
    assert.equal(developmentPoolFingerprint(pool,name),first)
    assert.throws(()=>developmentPoolFingerprint(pool,'runtime366_dev_aaaaaaaaaaaa_bbbbbbbbbbbb_test'),/exact local test Pool/)
    assert.equal(pool.totalCount,0)
  } finally {delete pool.options.host;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous}
})
