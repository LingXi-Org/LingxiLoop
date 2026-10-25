#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises'
import { callRelease, readManifest } from './client.mjs'

const [method, value] = process.argv.slice(2)
try {
  if (!method || method === '--help') console.log('release <plan|submit> manifest.json | <get|watch|resume|recover> release_id | accepted. Credentials: RELEASE_API_URL, RELEASE_API_TOKEN; recovery requires RELEASE_ADMIN_TOKEN.')
  else if (method !== 'watch') console.log(JSON.stringify(await callRelease(method, ['plan', 'submit'].includes(method) ? { manifest: await readManifest(value) } : { releaseId: value })))
  else {
    let after = 0
    for (;;) {
      const batch = await callRelease('watch', { releaseId: value, after })
      for (const event of batch.events) { console.log(JSON.stringify(event)); after = event.seq }
      const record = await callRelease('get', { releaseId: value })
      if (['accepted', 'failed', 'recovered', 'superseded', 'blocked'].includes(record.status)) { console.log(JSON.stringify(record)); if (record.status !== 'accepted') process.exitCode = 2; break }
      await delay(3000)
    }
  }
} catch (error) { console.error(JSON.stringify({ error: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'RELEASE_CLIENT_FAILED' })); process.exitCode = 1 }
