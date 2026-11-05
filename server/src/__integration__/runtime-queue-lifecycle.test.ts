import test from 'node:test'
import { permitProbe,delayedProbe,leaseProbe } from './_queue-capacity-fixture.js'

test('leased model wait is distinct from queue and attempt execution', {timeout:20_000}, permitProbe)
test('delayed eligibility and cancellation do not mean missing capacity', {timeout:10_000}, delayedProbe)
test('abandoned PG lease is reclaimed and stale owners remain fenced', {timeout:75_000}, leaseProbe)
