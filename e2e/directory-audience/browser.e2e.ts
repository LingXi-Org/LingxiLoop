import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Contract browser harness: real native worker/tools/PostgreSQL, scripted model and recorded IM.
// This verifies audience-specific results and continued turns, not the product SPA or live providers.
test('two frozen audiences receive only readable rooms and can continue the conversation', async ({ app, screen }) => {
  await app.open('/')
  for (const audience of ['A', 'B']) {
    const output = screen.getByRole('status', `Audience ${audience} result`)
    await screen.getByRole('button', `Run ${audience} turn 1`, { exact: true }).tap()
    await expect(output).toContainText('"status": "succeeded"', { timeout: 60000 })
    await expect(output).toContainText(`directory-dm-${audience.toLowerCase()}`)
    await expect(output).toContainText('directory-shared')
    await expect(output).not.toContainText(`directory-dm-${audience === 'A' ? 'b' : 'a'}`)
    await expect(output).not.toContainText('directory-left')
    await expect(output).not.toContainText('directory-other-tenant')
    if (audience === 'B') await expect(output).not.toContainText('directory-project-room')
    await screen.getByRole('button', `Run ${audience} turn 2`, { exact: true }).tap()
    await expect(output).toContainText('"turn": 2', { timeout: 60000 })
    await expect(output).toContainText('"durableReply": true')
    await app.screenshot(`audience-${audience.toLowerCase()}-continued`)
  }
})
