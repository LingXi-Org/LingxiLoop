import assert from 'node:assert/strict'
import test from 'node:test'
import {nativeSharedIconChunk} from './native-artifact-shared-icons'

test('only the two measured shared public icons receive an explicit chunk',()=>{
 for(const icon of ['bot','image']){
  assert.equal(nativeSharedIconChunk(`/repo/node_modules/lucide-react/dist/esm/icons/${icon}.mjs`),'artifact-shared-icons')
  assert.equal(nativeSharedIconChunk(`C:\\repo\\node_modules\\lucide-react\\dist\\esm\\icons\\${icon}.mjs`),'artifact-shared-icons')
 }
 for(const id of ['/repo/src/features/chat/ConversationThread.tsx','/repo/node_modules/react/index.js','/repo/node_modules/lucide-react/dist/esm/createLucideIcon.mjs','/repo/node_modules/lucide-react/dist/esm/icons/image-plus.mjs','/repo/node_modules/@lingxi-org/lingxios/dist/image.mjs','/repo/src/icons/bot.mjs'])assert.equal(nativeSharedIconChunk(id),undefined)
})
