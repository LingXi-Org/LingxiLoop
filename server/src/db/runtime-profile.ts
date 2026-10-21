import { releaseVersions } from '@lyyzka/lingxios'

// Published3.6 native14 bytes are unchanged by the reviewed3.7 reader release.
export const PUBLIC_PURPOSE_SCHEMA_HASH = 'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f'
interface RuntimeVersions { runtime:string; schema:number; controlPlane:number; publicText?:number }

export function assertMigrationRuntime(delivery:boolean,purposeReader:boolean,
  versions:RuntimeVersions=releaseVersions,schemaHash?:string):void {
  if(purposeReader){
    if(!delivery||versions.runtime!=='3.7.0'||versions.schema!==14||versions.controlPlane!==11
      ||versions.publicText!==2||schemaHash!==PUBLIC_PURPOSE_SCHEMA_HASH){
      throw new Error('0051 requires the formally published LingxiOS 3.7.0/schema14/publicText2 package and unchanged native schema')
    }
  }else if(delivery&&(versions.runtime!=='3.6.0'||versions.schema!==14)){
    throw new Error('0050 requires the formally published LingxiOS 3.6.0/schema14 package')
  }
}
