import { createHmac } from 'node:crypto'

const value = process.env.KOMODO_WEBHOOK_URL
const secret = process.env.KOMODO_WEBHOOK_SECRET
const apiKey = process.env.KOMODO_API_KEY
const apiSecret = process.env.KOMODO_API_SECRET
if (!value || !secret || !apiKey || !apiSecret) throw new Error('Komodo rollout credentials are required')

const url = new URL(value)
if (url.protocol !== 'https:' || url.hostname !== 'ops.christmas1314.xyz'
  || !/^\/listener\/github\/procedure\/[\w-]+\/main$/.test(url.pathname)) throw new Error('invalid Komodo webhook URL')

const body = JSON.stringify({ ref: 'refs/heads/main', repository: { full_name: 'lyyzka/LingxiLoop' } })
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
const startedAt = Date.now()
const response = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-github-event': 'push', 'x-hub-signature-256': signature },
  body,
})
if (!response.ok) throw new Error(`Komodo webhook returned ${response.status}`)
const text = await response.text()
let id = text ? JSON.parse(text)?._id?.$oid : undefined
const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'x-api-secret': apiSecret }
for (let attempt = 0; !id && attempt < 10; attempt += 1) {
  const result = await fetch(new URL('/read/ListUpdates', url), { method: 'POST', headers, body: '{}' })
  if (!result.ok) throw new Error(`Komodo update lookup returned ${result.status}`)
  id = (await result.json()).updates?.find(update => update.operation === 'RunProcedure' && update.start_ts >= startedAt - 5_000)?.id
  if (!id) await new Promise(resolve => setTimeout(resolve, 500))
}
if (!id) throw new Error('Komodo webhook did not return an update id')

for (let attempt = 0; attempt < 180; attempt += 1) {
  const result = await fetch(new URL('/read/GetUpdate', url), { method: 'POST', headers, body: JSON.stringify({ id }) })
  if (!result.ok) throw new Error(`Komodo update poll returned ${result.status}`)
  const current = await result.json()
  if (current.status === 'Complete') {
    if (!current.success) throw new Error('Komodo rollout failed')
    process.exit(0)
  }
  await new Promise((resolve) => setTimeout(resolve, 10_000))
}
throw new Error('Komodo rollout timed out')
