/** These measured icons otherwise co-locate with lazy conversation/preview UI or the query library.
 * Keep their public modules shared without pulling chat into editor startup.
 * Dependencies stay under Rollup's normal ownership with explicit chunks only.
 */
export function nativeSharedIconChunk(id:string):string|undefined{
 return /\/node_modules\/lucide-react\/dist\/esm\/icons\/(bot|image|chevron-down|ellipsis|chevron-left|chevron-right|x)\.mjs$/.test(id.replace(/\\/g,'/'))?'artifact-shared-icons':undefined
}
