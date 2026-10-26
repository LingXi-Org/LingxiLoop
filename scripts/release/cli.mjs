#!/usr/bin/env node
import { callRelease, readManifest } from './client.mjs'

const [method, value] = process.argv.slice(2)
try {
  if (!method || method === '--help') console.log('release <plan|submit> manifest.json | <get|watch|resume|recover> release_id | accepted. Credentials: RELEASE_API_URL, RELEASE_API_TOKEN; recovery requires RELEASE_ADMIN_TOKEN.')
  else if (method !== 'watch') console.log(JSON.stringify(await callRelease(method, ['plan', 'submit'].includes(method) ? { manifest: await readManifest(value) } : { releaseId: value })))
  else {
    // Primitive parity with MCP: one finite batch. The canonical run.sh entry
    // owns durable observation budgets and resumable local receipts.
    const after=Number(process.argv[4]??0)
    if(!Number.isSafeInteger(after)||after<0)throw Error('INVALID_EVENT_CURSOR')
    console.log(JSON.stringify(await callRelease('watch',{releaseId:value,after})))
  }
} catch (error) { console.error(JSON.stringify({ error: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'RELEASE_CLIENT_FAILED' })); process.exitCode = 1 }
