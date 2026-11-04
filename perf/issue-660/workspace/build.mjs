import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
const source = resolve(process.argv[2] ?? '.')
const owner = resolve(source, 'src/desktop/useSidebarWidth.ts')
await build({ configFile: false, root: resolve('perf/issue-660/workspace'), plugins: [react()], logLevel: 'warn', worker: { format: 'es' },
  resolve: { alias: { '@': resolve(source, 'src'), 'sidebar-width-owner': existsSync(owner) ? owner : resolve('perf/issue-660/workspace/legacy-sidebar-width.ts') } },
  build: { outDir: resolve(process.argv[3]), emptyOutDir: true, sourcemap: true } })
