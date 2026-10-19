import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { visualizeFixtureApi } from './fixture-api'

const root=process.cwd()
const upstream=path.join(root,'third_party/zcode/upstream/packages/ui/src')
const product=path.join(root,'src/features/chat/visualize/zcode')
export default defineConfig({
  plugins:[visualizeFixtureApi(),react()],
  resolve:{alias:[
    ...['button','dialog','textarea'].map(name=>({find:`@/components/ui/${name}.js`,replacement:path.join(upstream,`components/ui/${name}.tsx`)})),
    {find:'@/lib/utils.js',replacement:path.join(upstream,'components/lib/utils.ts')},
    {find:'@/hooks/useGenUi.js',replacement:path.join(product,'hooks/useGenUi.ts')},
    {find:'@/i18n/IntlProvider.js',replacement:path.join(product,'i18n/IntlProvider.ts')},
    {find:'@/gen-ui',replacement:path.join(upstream,'gen-ui')},
    {find:'@zcode/shared/gen-ui',replacement:path.join(product,'shared/gen-ui/index.ts')},
    {find:'@',replacement:path.join(root,'src')},
  ],dedupe:['react','react-dom','radix-ui']},
  cacheDir:'node_modules/.vite-issue193',
  server:{host:'127.0.0.1',port:5193,strictPort:true,hmr:false,watch:{ignored:['**/*']}},
  optimizeDeps:{entries:['e2e/visualize/index.html']},
})
