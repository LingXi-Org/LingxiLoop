import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({publicDir:false,plugins:[react()],cacheDir:'/tmp/376-cover-live-vite-cache',
 resolve:{alias:[{find:'@/stores/auth',replacement:path.resolve('scripts/case-cover-live-auth.ts')},{find:'@',replacement:path.resolve('src')}],dedupe:['react','react-dom','zustand']},
 optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','next-themes','zustand']},worker:{format:'es'},
 server:{host:'127.0.0.1',port:5290,strictPort:true,proxy:{'/api':'http://127.0.0.1:5291','/__cover-fixture':'http://127.0.0.1:5291'},watch:{ignored:['**/third_party/**','**/.git/**']}}})
