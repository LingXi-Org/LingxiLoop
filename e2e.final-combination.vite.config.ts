import { mergeConfig } from 'vite'
import base from './vite.config'

// The activity fixture imports this public export outside index.html.
// Prebundle it before measuring a render so dev optimization cannot reload it.
export default mergeConfig(base, {
  optimizeDeps: { include: ['@lyyzka/lingxios/ui'] },
})
