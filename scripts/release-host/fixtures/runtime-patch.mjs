export function patchFixture(product=57){
 const migrations=Array.from({length:product},(_,i)=>({version:i+1,name:`migration_${i+1}`,checksum:String(i%10).repeat(64)}))
 const source={runtime:product===58?'3.8.14':'3.8.12',schema:14,protocol:11,schemaHash:'a'.repeat(64),productVersion:product,migrations}
 const runtime=product===58?'3.8.15':'3.8.14'
 return {source,target:{...structuredClone(source),runtime,integrity:`sha512-${'A'.repeat(86)}==`,tarball:`https://npm.pkg.github.com/download/@lyyzka/lingxios/${runtime}/${'b'.repeat(40)}`}}
}
export function databaseFixture(product=57){const runtimePatch=patchFixture(product);return {from:{nativeSchema:14,productSchema:product},to:{nativeSchema:14,productSchema:product},migrations:structuredClone(runtimePatch.source.migrations),runtimePatch}}
