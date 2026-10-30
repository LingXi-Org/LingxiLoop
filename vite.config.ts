import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { isolatedEditor } from './shared/artifact-editor-origin'
import { VISUALIZE_PUBLIC_RESOURCES, visualizeResourceFile, visualizeResourceUrl } from './shared/visualize-public-resources'

// Vite proxy target. Default points at the local dev server; set
// LINGXILOOP_DEV_API_TARGET=https://loop.example.com (no trailing slash) to
// run the dev renderer against production without rebuilding.
const HTTP_TARGET = process.env.LINGXILOOP_DEV_API_TARGET || 'http://localhost:5181'
const WS_TARGET = process.env.LINGXILOOP_DEV_WS_TARGET || HTTP_TARGET.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react(), {
    name: 'isolated-artifact-editor',
    configureServer(server) {
      const base = process.env.LINGXILOOP_ARTIFACT_EDITOR_BASE ?? 'http://artifact.localhost:5180'
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
        if (!url.hostname.endsWith(`-${new URL(base).hostname}`)) return next()
        try {
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          // Node fetch decompresses upstream bodies but retains their encoding header.
          headers.set('accept-encoding', 'identity')
          const response = await isolatedEditor(new Request(url, { method: req.method, headers,
            ...(!['GET', 'HEAD'].includes(req.method ?? 'GET') ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
          }), base, HTTP_TARGET)
          if (!response) return next()
          res.statusCode = response.status
          response.headers.forEach((value, key) => { res.setHeader(key, value) })
          if (response.body) Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).on('error', next).pipe(res)
          else res.end()
        } catch (error) { next(error) }
      })
    },
  }, {
    name: 'visualize-public-assets',
    async generateBundle() {
      // These are the same fixed bytes/hash identities advertised by the API.
      // Existing static release retention preserves old URLs across rollouts.
      for (const name of VISUALIZE_PUBLIC_RESOURCES) {
        const source = await readFile(visualizeResourceFile(name)!)
        const digest = createHash('sha256').update(source).digest('hex')
        this.emitFile({type:'asset',fileName:visualizeResourceUrl(name,digest)!.slice(1),source})
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!/^\/assets\/visualize-[a-f0-9]{64}\.(js|css|txt)$/.test(req.url ?? '')) return next()
        try {
          for (const name of VISUALIZE_PUBLIC_RESOURCES) {
            const source = await readFile(visualizeResourceFile(name)!)
            const digest = createHash('sha256').update(source).digest('hex')
            if (req.url !== visualizeResourceUrl(name,digest)) continue
            res.setHeader('Cache-Control','public, max-age=31536000, immutable')
            res.setHeader('Access-Control-Allow-Origin','*')
            res.setHeader('X-Content-Type-Options','nosniff')
            res.setHeader('Content-Type',name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream')
            res.end(source); return
          }
          res.statusCode=404; res.end()
        } catch (error) { next(error) }
      })
    },
  }],
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
      '/artifact-editor': { target: HTTP_TARGET, changeOrigin: true, secure: false },
      '/_blob':    { target: HTTP_TARGET, changeOrigin: true, secure: false },
      '/ws':       { target: WS_TARGET,   ws: true,           secure: false },
    },
  },
})
