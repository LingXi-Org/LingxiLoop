// The normal migrator validates the frozen candidate before requesting a connection.
// No server/database is contacted; missing migration 47 is not bypassed.
import assert from 'node:assert/strict'
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/issue219_test'
const { migrateDatabase } = await import('../../../server/src/db/migrate.ts')
const { closeDatabasePools } = await import('../../../server/src/db/pool.ts')
let connections = 0, error
try {
  await migrateDatabase({connect: async () => { connections++; throw new Error('Unexpected database connection') }})
} catch (failure) { error = failure.message }
await closeDatabasePools()
console.log(JSON.stringify({base:'dc4bc88b81f0b9011c7540e4dc7f0889cab23778',error,connections,httpPgStatus:'blocked-before-connect'},null,2))
assert.equal(connections,0)
assert.equal(error,'migration sequence must be contiguous from 0001; expected 47, found 48')
process.exitCode = 2
