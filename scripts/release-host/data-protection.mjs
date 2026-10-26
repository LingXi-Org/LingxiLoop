import { fault } from './journal.mjs'

// Explicit test-data exception, never inferred from environment names or inherited
// from an accepted release. It does not apply to SDK/native schema upgrades.
export function testDataNoBackup(database, source, target) {
  if (database.rpo === 'zero-committed-writes') return false
  if (database.rpo !== 'test-data-no-backup') throw fault('INVALID_DATABASE_PLAN','Unknown database protection mode')
  if (database.runtimePatch || !source?.lingxios || source.lingxios !== target?.lingxios ||
    database.from?.nativeSchema !== database.to?.nativeSchema || source.nativeSchema !== target.nativeSchema ||
    database.to?.productSchema <= database.from?.productSchema) {
    throw fault('TEST_DATA_MODE_INCOMPATIBLE','No-backup test mode requires a forward product migration with unchanged SDK and native schema')
  }
  return true
}
export function authorizedTestDataMode(plan, policy) {
  const enabled = testDataNoBackup(plan.database,plan.source?.contract,plan.contract)
  if (enabled && policy.allowTestDataNoBackup !== true) throw fault('TEST_DATA_MODE_NOT_AUTHORIZED','Trusted local policy must explicitly allow test-data migrations without a recovery point')
  return enabled
}
