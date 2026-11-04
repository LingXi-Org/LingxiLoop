import { resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
const source = resolve(process.argv[2] ?? '.')
await build({ configFile: false, root: resolve('perf/issue-660'), plugins: [react()], logLevel: 'warn',
  resolve: { alias: { '@': resolve(source, 'src'), 'react-dom/client': 'react-dom/profiling' } },
  build: { outDir: resolve(process.argv[3]), emptyOutDir: true } })
