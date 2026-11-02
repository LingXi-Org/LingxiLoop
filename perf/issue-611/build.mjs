import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
const root = resolve(process.argv[2] ?? '.')
await build({ configFile: false, root: resolve('.'), plugins: [react()], resolve: { alias: { '@': resolve(root, 'src') } },
  build: { outDir: resolve(process.argv[3] ?? '/tmp/issue-611-a'), emptyOutDir: true,
    rollupOptions: { input: resolve('perf/issue-611/index.html') } } })
