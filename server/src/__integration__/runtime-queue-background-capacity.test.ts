import test from 'node:test'
import { runProfile } from './_queue-capacity-fixture.js'

test('persistent background queue qualifies bounded retrieval at unchanged capacity', {timeout:150_000}, async context => {
  await runProfile('background',context)
})
