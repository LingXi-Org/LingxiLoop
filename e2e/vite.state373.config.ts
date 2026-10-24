import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { answerFirstFixture } from './answer-first/server'

// Only two synthetic entrypoints; no proxy, environment files or generated-asset build.
export default defineConfig({
  envDir: resolve(__dirname, 'state373-empty-env'),
  plugins: [react(), answerFirstFixture(), {
    name: 'state373-fixture-errors',
    transformIndexHtml: () => [{ tag: 'script', injectTo: 'head-prepend', children: `
      addEventListener('error', event => {
        const detail = event.message || ('Failed fixture resource: ' + (event.target?.src || event.target?.href || 'unknown'));
        console.error('state373 fixture error', detail);
        const report = document.createElement('pre'); report.setAttribute('role', 'alert'); report.textContent = detail;
        (document.body || document.documentElement).append(report);
      }, true);
      addEventListener('unhandledrejection', event => {
        const report = document.createElement('pre'); report.setAttribute('role', 'alert'); report.textContent = String(event.reason);
        (document.body || document.documentElement).append(report);
      });
    ` }],
  }],
  cacheDir: '/tmp/loop-state373-vite-cache',
  resolve: { alias: { '@': resolve(__dirname, '../src') }, dedupe: ['@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'] },
  optimizeDeps: { entries: ['e2e/answer-first.html', 'e2e/questionnaire.html'] },
  server: { host: '127.0.0.1', port: 53124, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
})
