import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Vite proxy target. Default points at the local dev server; set
// LINGXILOOP_DEV_API_TARGET=https://loop.example.com (no trailing slash) to
// run the dev renderer against production without rebuilding.
const HTTP_TARGET = process.env.LINGXILOOP_DEV_API_TARGET || 'http://localhost:5181'
const WS_TARGET = process.env.LINGXILOOP_DEV_WS_TARGET || HTTP_TARGET.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react()],
  // Retab format workers lazy-load their parsers as native ES modules.
  worker: { format: 'es' },
  // Disposable API fixtures use distinct caches. Concurrent dev servers with
  // different proxy defines must not replace each other's optimized modules.
  cacheDir: process.env.LINGXILOOP_VITE_CACHE_DIR,
  // The renderer uses relative URLs through the Vite proxy, but commands
  // copied from the UI run outside that proxy and need the API origin.
  define: {
    'import.meta.env.VITE_LINGXILOOP_DEV_API_TARGET': JSON.stringify(HTTP_TARGET),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // yjs and prosemirror rely on instanceof checks across packages
    // (y-prosemirror decorations, tiptap extensions). If Vite's dep
    // optimizer ever splits them into more than one chunk instance —
    // which happened when @tiptap/extension-table was added — the editor
    // crashes with "Yjs was already imported" + `localsInner` TypeErrors.
    // Force a single module instance for each.
    dedupe: [
      '@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap',
      'yjs', 'y-prosemirror', 'prosemirror-model', 'prosemirror-state', 'prosemirror-view', 'prosemirror-transform',
    ],
  },
  optimizeDeps: {
    // Reference/evidence HTML is not an application entry. Scanning it resolves
    // third-party aliases against this app and repeatedly invalidates the cache.
    entries: ['index.html'],
    // Pre-bundle the yjs/prosemirror family as shared entries so every
    // tiptap extension chunk imports the SAME module instance (see
    // resolve.dedupe above — both are needed: dedupe fixes source-level
    // resolution, include fixes the dep-optimizer's chunk graph).
    include: [
      '@blocknote/core', '@blocknote/core/extensions', '@blocknote/react', '@blocknote/mantine',
      '@blocknote/code-block', '@blocknote/math-block', '@blocknote/diagram-block', 'react-dom/server',
      '@assistant-ui/react', '@assistant-ui/react-markdown',
      'yjs',
      '@tiptap/pm/model', '@tiptap/pm/state', '@tiptap/pm/view',
      '@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-table',
      '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-caret',
    ],
  },
  server: {
    host: true,
    port: 5173,
    // Third-party reference checkouts can contain tens of thousands of files
    // (including Python virtual environments). They are never renderer input;
    // keeping them out of the watcher prevents reload storms and stalled HMR.
    watch: {
      ignored: ['**/third_party/**', '**/.venv/**', '**/dist/**', '**/coverage/**'],
    },
    proxy: {
      '/api':      { target: HTTP_TARGET, changeOrigin: true, secure: false },
      '/uploads':  { target: HTTP_TARGET, changeOrigin: true, secure: false },
      '/ws':       { target: WS_TARGET,   ws: true,           secure: false },
    },
  },
})
