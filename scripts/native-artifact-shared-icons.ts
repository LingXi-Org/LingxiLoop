/** Bot/Image otherwise co-locate with the lazy conversation facade (issue 707).
 * Keep their public modules shared without pulling chat into editor startup.
 * Dependencies stay under Rollup's normal ownership with explicit chunks only.
 */
export function nativeSharedIconChunk(id:string):string|undefined{
 return /\/node_modules\/lucide-react\/dist\/esm\/icons\/(bot|image)\.mjs$/.test(id.replace(/\\/g,'/'))?'artifact-shared-icons':undefined
}
