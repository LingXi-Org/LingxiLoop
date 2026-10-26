import {dirname,isAbsolute,resolve} from 'node:path'
import {fault} from './journal.mjs'

/** Only trusted local policy can name paired Compose/environment snapshots. */
export function validateConfigurationPolicy(local){
 const mapping=local.configurationFiles
 if(mapping===undefined)return
 const valid=mapping&&typeof mapping==='object'&&!Array.isArray(mapping)&&Object.keys(mapping).length>0&&Object.entries(mapping).every(([hash,files])=>
  /^sha256:[a-f0-9]{64}$/.test(hash)&&files&&typeof files==='object'&&!Array.isArray(files)&&Object.keys(files).length===2&&['envFile','composeFile'].every(key=>{
   const path=files[key];return typeof path==='string'&&isAbsolute(path)&&!path.includes('\0')&&path===resolve(path)&&dirname(path)===dirname(resolve(local[key]))
  }))
 if(!valid)throw fault('INVALID_CONFIGURATION_FILES_POLICY','Configuration hashes must map to fixed Compose/environment snapshots in their original directories',422)
}
export function configurationFiles(local,configurationHash){
 if(local.configurationFiles===undefined)return{envFile:local.envFile,composeFile:local.composeFile}
 validateConfigurationPolicy(local)
 if(!Object.hasOwn(local.configurationFiles,configurationHash))throw fault('CONFIGURATION_FILES_NOT_APPROVED','Registered configuration hash is not approved by local snapshot policy',422)
 return local.configurationFiles[configurationHash]
}
