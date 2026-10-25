import { mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, unlinkSync, openSync, closeSync, fsyncSync } from 'node:fs'
import { keypair, decryptSecrets, sha256, secretNames } from './crypto.mjs'
const check=(v,c)=>{if(!v)throw Error(c)}
function privateDir(path){mkdirSync(path,{recursive:true,mode:0o700});const s=lstatSync(path);check(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077),'PRIVATE_DIRECTORY_REQUIRED')}
function readRegular(path){const s=lstatSync(path);check(s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o077),'PRIVATE_FILE_REQUIRED');return readFileSync(path,'utf8')}
function exclusive(path,value){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,value);fsyncSync(fd)}finally{closeSync(fd)}}
export function publicKey({run='/run/lingxi-release-bootstrap-495'}={}) {
 privateDir(run);const path=`${run}/ephemeral.json`
 if(!existsSync(path))exclusive(path,JSON.stringify(keypair()))
 return {version:1,publicKey:JSON.parse(readRegular(path)).publicKey}
}
export function credentials(envelope,{run='/run/lingxi-release-bootstrap-495',secrets='/etc/lingxi-release/secrets'}={}) {
 privateDir(run);privateDir(secrets)
 const receiptPath=`${run}/receipt-${envelope.requestId}.json`,envelopeHash=sha256(JSON.stringify(envelope))
 check(/^[a-f0-9]{32}$/.test(envelope.requestId),'INVALID_REQUEST_ID')
 if(existsSync(receiptPath)){const receipt=JSON.parse(readRegular(receiptPath));check(receipt.envelopeHash===envelopeHash,'REPLAY_CONFLICT');for(const [name,digest]of Object.entries(receipt.hashes))check(secretNames.includes(name)&&sha256(readRegular(`${secrets}/${name}`))===digest,'RECEIPT_FILE_DRIFT');if(existsSync(`${run}/ephemeral.json`))unlinkSync(`${run}/ephemeral.json`);return receipt}
 const bundle=decryptSecrets(JSON.parse(readRegular(`${run}/ephemeral.json`)).privateKey,envelope)
 // Check every destination before any write; existing different secrets are never overwritten.
 for(const [name,value]of Object.entries(bundle))if(existsSync(`${secrets}/${name}`))check(readRegular(`${secrets}/${name}`)===value,'SECRET_ALREADY_EXISTS_DIFFERENT')
 for(const [name,value]of Object.entries(bundle))if(!existsSync(`${secrets}/${name}`))exclusive(`${secrets}/${name}`,value)
 const receipt={version:1,requestId:envelope.requestId,envelopeHash,hashes:Object.fromEntries(Object.entries(bundle).map(([name,value])=>[name,sha256(value)]))}
 exclusive(receiptPath,JSON.stringify(receipt));unlinkSync(`${run}/ephemeral.json`)
 return receipt
}
export function query({run='/run/lingxi-release-bootstrap-495',secrets='/etc/lingxi-release/secrets',requestId}={}) {
 const hashes={};for(const name of secretNames)if(existsSync(`${secrets}/${name}`))hashes[name]=sha256(readRegular(`${secrets}/${name}`))
 const receipt=requestId&&/^[a-f0-9]{32}$/.test(requestId)&&existsSync(`${run}/receipt-${requestId}.json`)?JSON.parse(readRegular(`${run}/receipt-${requestId}.json`)):null
 return {version:1,hashes,receipt,publicKey:existsSync(`${run}/ephemeral.json`)?JSON.parse(readRegular(`${run}/ephemeral.json`)).publicKey:null}
}
