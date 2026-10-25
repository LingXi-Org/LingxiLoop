import { generateKeyPairSync, createPublicKey, createPrivateKey, diffieHellman, hkdfSync, randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
export const secretNames = ['executor-token','ingress-executor-token','access-client-id','access-client-secret','tunnel-token']
export const sha256 = data => createHash('sha256').update(data).digest('hex')
const check = (v, code) => { if (!v) throw Error(code) }
export function validateSecrets(bundle) {
 check(bundle && typeof bundle === 'object' && !Array.isArray(bundle) && Object.keys(bundle).length > 0, 'EMPTY_SECRET_BUNDLE')
 for (const [key,value] of Object.entries(bundle)) check(secretNames.includes(key) && typeof value === 'string' && value.length >= 16 && value.length <= 16384 && !/[\r\n\0]/.test(value), 'INVALID_SECRET_BUNDLE')
 return bundle
}
export function keypair() {
 const {privateKey,publicKey}=generateKeyPairSync('x25519')
 return {privateKey:privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64')}
}
function key(privateKey,publicKey,context) {
 return Buffer.from(hkdfSync('sha256',diffieHellman({privateKey:createPrivateKey({key:Buffer.from(privateKey,'base64'),type:'pkcs8',format:'der'}),publicKey:createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'})}),Buffer.alloc(0),Buffer.from(context),32))
}
export function encryptSecrets(publicKey,bundle,requestId) {
 validateSecrets(bundle);check(/^[a-f0-9]{32}$/.test(requestId),'INVALID_REQUEST_ID')
 const cloud=keypair(),iv=randomBytes(12),context=`lingxi-bootstrap-495:${requestId}:${sha256(Buffer.from(publicKey,'base64'))}`
 const cipher=createCipheriv('aes-256-gcm',key(cloud.privateKey,publicKey,context),iv);cipher.setAAD(Buffer.from(context))
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(bundle),'utf8'),cipher.final()])
 return {version:1,requestId,hostPublicKeyHash:sha256(Buffer.from(publicKey,'base64')),publicKey:cloud.publicKey,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')}
}
export function decryptSecrets(privateKey,envelope) {
 check(envelope?.version===1&&/^[a-f0-9]{32}$/.test(envelope.requestId),'INVALID_ENVELOPE')
 const own=createPublicKey(createPrivateKey({key:Buffer.from(privateKey,'base64'),type:'pkcs8',format:'der'})).export({type:'spki',format:'der'})
 check(sha256(own)===envelope.hostPublicKeyHash,'WRONG_HOST_KEY')
 const context=`lingxi-bootstrap-495:${envelope.requestId}:${envelope.hostPublicKeyHash}`
 const decipher=createDecipheriv('aes-256-gcm',key(privateKey,envelope.publicKey,context),Buffer.from(envelope.iv,'base64'));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'))
 return validateSecrets(JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8')))
}
