import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const icons = readFileSync('index.html', 'utf8').split('\n').filter(line => /<link rel="(?:icon|shortcut icon|apple-touch-icon|manifest)"/.test(line)).join('\n')
const rows = ['ordinary', 'pinned'].map((id, index) => ({ id, kind: 'group', title: index ? '已经置顶的课程会话' : '需要截断的长中文课程会话标题'.repeat(8),
  subtitle: null, topic: null, members: [], leaderId: null, pinned: Boolean(index), muted: false, mutedUntil: null,
  tag: null, pulledBy: null, createdAt: '2026-10-24T00:00:00Z', updatedAt: '2026-10-24T00:00:00Z', unreadCount: 4, lastMessage: null }))
export default defineConfig({
  plugins: [react(), { name: 'synthetic-conversation-api',
    transformIndexHtml(html, context) { return context.path === '/e2e/favicon-pinned/index.html' ? html.replace('</head>', `${icons}</head>`) : html },
    configureServer(server) { server.middlewares.use(async (request, response, next) => {
      if (!request.url?.startsWith('/api/')) return next()
      response.setHeader('content-type', 'application/json')
      if (request.url === '/api/im/channels' && request.method === 'GET') { response.end(JSON.stringify(rows)); return }
      const match = request.url.match(/^\/api\/conversations\/([^/]+)\/pin$/)
      const row = match && rows.find(item => item.id === match[1])
      if (row && request.method === 'POST') {
        let body = ''; for await (const chunk of request) body += chunk
        row.pinned = JSON.parse(body).pinned; response.end(JSON.stringify({ ok: true, pinned: row.pinned })); return
      }
      response.statusCode = 404; response.end(JSON.stringify({ error: 'No synthetic route' }))
    }) },
  }],
  cacheDir: '.e2e/favicon-pinned-vite/node_modules/.vite',
  resolve: { alias: { '@': path.resolve('src') }, dedupe: ['react', 'react-dom', '@assistant-ui/react', '@assistant-ui/store', '@assistant-ui/core'] },
  optimizeDeps: { entries: ['e2e/favicon-pinned/index.html'], esbuildOptions: { sourcemap: false } },
  server: { host: '127.0.0.1', port: 5196, strictPort: true },
})
