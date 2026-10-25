import { unstable_startWorker } from 'wrangler'
const worker = await unstable_startWorker({
  config: 'e2e/admin/wrangler.e2e.jsonc',
  dev: {
    server: { hostname: '127.0.0.1', port: 8797 },
    persist: '.e2e/control-state', remote: false, watch: false,
    outboundService: request => globalThis.fetch(request.url, request),
  },
})
await worker.ready
console.log('Local real Worker ready with Node environment proxy for outbound HTTPS.')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await worker.dispose(); process.exit(0) })
