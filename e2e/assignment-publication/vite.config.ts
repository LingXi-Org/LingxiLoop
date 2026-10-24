import { defineConfig, mergeConfig } from 'vite'
import { resolve } from 'node:path'
import base from '../../vite.config'

// Real application compiled once; same loopback synthetic API as the dev run.
export default mergeConfig(base,defineConfig({
  publicDir:false,
  build:{outDir:'.e2e/issue-381/static',emptyOutDir:true,sourcemap:false,minify:false,reportCompressedSize:false,
    rollupOptions:{input:resolve(__dirname,'../..','index.html')}},
  preview:{host:'127.0.0.1',port:53098,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:53097',changeOrigin:true}}},
}))
