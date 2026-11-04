// node perf/editor-open/build.mjs <source root containing src/> <out dir>
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
const source = resolve(process.argv[2] ?? '.')
const preload = resolve(source, 'src/features/artifacts/editor-preload.ts')
await build({ configFile: false, root: resolve('perf/editor-open'), plugins: [react()], logLevel: 'warn',
  resolve: { alias: { '@': resolve(source, 'src'), 'perf-preload': existsSync(preload) ? preload : resolve('perf/editor-open/no-preload.ts') } },
  build: { outDir: resolve(process.argv[3]), emptyOutDir: true } })
console.log(JSON.stringify({ source, preload: existsSync(preload) }))
