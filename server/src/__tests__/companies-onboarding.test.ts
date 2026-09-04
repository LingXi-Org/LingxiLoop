import assert from 'node:assert/strict'
import test from 'node:test'
import { CompanyOnboardingApplication } from '../modules/companies/onboarding-application.js'

test('committed company onboarding remains successful when immediate IM reconciliation is incomplete', async () => {
  const reports: string[] = []
  const application = new CompanyOnboardingApplication({
    transaction: async () => { throw new Error('transaction is not used by finalize') },
    invalidatePersonas: () => undefined,
    reconcileChannels: async () => ({ channels: 8, failures: 2 }),
    reportReconciliationFailure: (message) => { reports.push(message) },
  })

  await application.finalize(true)

  assert.deepEqual(reports, ['WuKongIM learning channel reconciliation failed (2/8)'])
})

test('committed company onboarding reports a rejected IM reconciliation without failing the request', async () => {
  const reports: string[] = []
  const application = new CompanyOnboardingApplication({
    transaction: async () => { throw new Error('transaction is not used by finalize') },
    invalidatePersonas: () => undefined,
    reconcileChannels: async () => { throw new Error('WuKong unavailable') },
    reportReconciliationFailure: (message) => { reports.push(message) },
  })

  await application.finalize(false)

  assert.deepEqual(reports, ['WuKongIM learning channel reconciliation failed (WuKong unavailable)'])
})
