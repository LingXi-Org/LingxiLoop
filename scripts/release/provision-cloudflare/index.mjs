import { pathToFileURL } from 'node:url'
import { journal, cloudflare, preflight, resumeDenied, METADATA, HOSTS } from './core.mjs'
export * from './core.mjs'
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const log = journal()
  try {
    const client = cloudflare()
    if (process.argv.includes('--resume-denied')) resumeDenied(log, client.credentialRevision)
    log.record({ action: 'account', accountId: client.account, status: 'selected' })
    const available = await preflight(client, log)
    console.log(JSON.stringify({ phase: 'read-preflight', available, metadata: METADATA }))
    if (process.argv.includes('--execute')) {
      const { execute } = await import('./resources.mjs')
      const results = await execute(client, log, available)
      log.record({ action: 'provision-finished', status: results.every(item => item.status !== 'blocked') ? 'complete' : 'partial', results })
      console.log(JSON.stringify({ phase: 'execute', results, metadata: METADATA }))
      if (results.some(item => item.status === 'blocked')) process.exitCode = 1
    } else if (!process.argv.includes('--preflight')) console.log(JSON.stringify({ mode: 'plan', resources: [...HOSTS.map(host => ({ name: host.name, domain: host.domain, service: 'http://127.0.0.1:17951', access: 'one 2160h service token; default deny' })), { bucket: 'lingxiloop-releases', public: false }], mutationRequires: '--execute' }))
  } catch (error) { log.record({ action: 'provision', status: 'blocked', code: error.code ?? 'PROVISION_ERROR', target: error.target, httpStatus: error.status, detail: error.detail }); console.error(JSON.stringify({ code: error.code ?? 'PROVISION_ERROR', target: error.target })); process.exitCode = 1 }
}
