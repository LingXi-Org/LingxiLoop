import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// API/browser failure inventory is also recorded in im-send-wukong.test.ts.
test.describe('IM receipt reconciliation HTTP contract', { tags: ['web', 'im-reconciliation'],
  ...(process.env.IM_RECONCILIATION_BROWSER === '1' ? {} : { skip: 'Requires scripts/test-im-send-reconciliation.mjs --browser' }),
}, () => {
  test('status stays compatible, concurrent recovery is idempotent, and a new human turn still sends', async ({ app, browser, screen }) => {
    await app.open('/')
    await expect(screen.getByRole('heading', 'IM 回执核对 API 验证')).toBeVisible()
    const result = await browser.evaluate(async () => {
      const manifest = await (await fetch('/__im_reconciliation/manifest')).json()
      const { companyId, projectId, channelId, payload, unknownPayload, expectedMessageId } = manifest
      const headers = { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId }
      const status = async (nonce: string) => (await fetch(`/api/im/sends/${nonce}`, { headers })).json()
      const send = async (message: { id: string }) => {
        const response = await fetch(`/api/im/channels/${channelId}/messages/accept`, {
          method: 'POST', headers, body: JSON.stringify({ clientNonce: message.id, payload: message }) })
        return { status: response.status, body: await response.json() }
      }
      const before = await status(payload.id)
      const recovered = await Promise.all(Array.from({ length: 6 }, () => send(payload)))
      const after = await status(payload.id)
      const unknown = await send(unknownPayload)
      const uncertain = await status(unknownPayload.id)
      const next = { ...payload, id: `${payload.id}-next`, content: [{ type: 'text', text: 'Synthetic next human turn.' }] }
      const continued = await send(next)
      const history = await (await fetch(`/api/im/channels/${channelId}/messages?limit=100`, { headers })).json()
      const foreign = await fetch(`/api/im/channels/${channelId}/messages/accept`, { method: 'POST',
        headers: { ...headers, 'x-company-id': 'foreign-company' }, body: JSON.stringify({ clientNonce: payload.id, payload }) })
      return { before, after, recovered: recovered.map(item => ({ status: item.status, id: item.body.echo?.messageId })),
        expectedMessageId, unknownStatus: unknown.status, unknownError: unknown.body.error, uncertain,
        continuedStatus: continued.status, foreignStatus: foreign.status,
        originalMessages: history.filter((item: { clientMsgNo: string }) => item.clientMsgNo === payload.id).length,
        unknownMessages: history.filter((item: { clientMsgNo: string }) => item.clientMsgNo === unknownPayload.id).length,
        nextMessages: history.filter((item: { clientMsgNo: string }) => item.clientMsgNo === next.id).length,
        stats: await (await fetch('/__im_reconciliation/stats')).json() }
    })
    expect(result.before.status).toBe('pending'); expect(result.before.echo).toBe(null)
    expect(Object.keys(result.before).sort()).toEqual(['channelId', 'echo', 'error', 'status', 'updatedAt'])
    expect(result.after.status).toBe('accepted')
    expect(result.recovered.every(item => item.status === 200 && item.id === result.expectedMessageId)).toBe(true)
    expect(result.unknownStatus).toBe(503); expect(result.unknownError).toContain('投递待恢复')
    expect(result.uncertain.status).toBe('pending'); expect(result.uncertain.echo).toBe(null)
    expect(result.continuedStatus).toBe(202); expect(result.foreignStatus).toBe(403)
    expect(result.originalMessages).toBe(1); expect(result.unknownMessages).toBe(0); expect(result.nextMessages).toBe(1)
    expect(result.stats).toEqual({ models: 0, actions: 0 })
    await app.screenshot('im-reconciliation-api-boundary')
  })
})
