import pg from 'pg'
import { seedNavigationFixtures } from './navigation-seed'

const url = new URL(process.env.DATABASE_URL ?? '')
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash
  || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/lingxiloop_browser_test') {
  throw new Error('Navigation fixtures require the dedicated local lingxiloop_browser_test database')
}
const db = new pg.Client({ connectionString: url.href })
await db.connect()
try {
  await db.query('BEGIN')
  await seedNavigationFixtures(db)
  await db.query('COMMIT')
  console.log('Navigation fixtures ready in the dedicated local browser-test database')
} catch (error) { await db.query('ROLLBACK'); throw error }
finally { await db.end() }
