import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
const owned = ['src/styles/globals.css', 'src/styles/chat.css', 'src/components/ui/table.tsx', 'src/features/chat/components/ComposerLexicalInput.tsx', 'src/features/chat/components/ComposerTriggers.tsx', 'src/features/chat/components/ConversationThread.tsx']
const baseline = new Map(owned.map(file => [path.resolve(file), execFileSync('git', ['show', `2686f475eac075bc9033f13714d5d6bbfa5078eb:${file}`], { encoding: 'utf8' })]))
const before = process.env.E2E_VISUAL_BASELINE === '1'
export default defineConfig({
  plugins: [{ name: 'synthetic-source-comparison', enforce: 'pre',
    load(id) { if (before) { const source = baseline.get(id.split('?')[0]); return id.split('?')[0].endsWith('src/styles/globals.css') && source ? source.replace('@import "./chat.css";', '').replace('@custom-variant', `${baseline.get(path.resolve('src/styles/chat.css'))}\n@custom-variant`) : source } },
  }, react({ exclude: /node_modules|loop373-visual-vite-cache/ })],
  cacheDir: '/tmp/loop373-visual-vite-cache',
  resolve: { alias: { '@': path.resolve('src') }, dedupe: ['react', 'react-dom', '@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap', 'lexical'] },
  optimizeDeps: { esbuildOptions: { sourcemap: false }, entries: ['e2e/visual-input.html'], include: ['@lyyzka/lingxios/ui', '@assistant-ui/react', '@assistant-ui/react-lexical'] },
  server: { host: '127.0.0.1', port: 5193, strictPort: true, watch: { ignored: ['**/third_party/**'] } },
})
