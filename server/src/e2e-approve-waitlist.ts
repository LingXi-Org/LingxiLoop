/**
 * One-shot e2e test for the waitlist approval flow + welcome email.
 *
 * Inserts a pending waitlist row, calls approveWaitlist, prints what
 * happened, and emits cleanup SQL at the end. Intentionally NOT idempotent
 * — each run creates a fresh waitlist/user/company set so we can verify
 * the real Resend send goes out.
 *
 * Usage:
 *   LINGXILOOP_E2E_EMAIL=you@example.com npx tsx server/src/e2e-approve-waitlist.ts
 *
 * Pre-reqs (already in .env on this machine):
 *   - DATABASE_URL pointed at a dev lingxiloop DB
 *   - RESEND_API_KEY + EMAIL_DOMAIN set
 *   - LINGXILOOP_E2E_EMAIL — a real inbox you control (a `+tag` is appended)
 *   - An admin users row exists (the script auto-discovers one)
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'
import { approveWaitlist } from './modules/admin/facade.js'

async function main(): Promise<void> {
  const stamp = Date.now()
  const baseEmail = process.env.LINGXILOOP_E2E_EMAIL
  if (!baseEmail || !baseEmail.includes('@')) {
    console.error('[e2e] set LINGXILOOP_E2E_EMAIL to an inbox you control (the welcome email is really sent)')
    process.exit(1)
  }
  const [local, domain] = baseEmail.split('@')
  const testEmail = `${local}+lingxiloop-e2e-${stamp}@${domain}`
  const displayName = `E2E ${stamp}`

  console.log(`[e2e] target email: ${testEmail}`)

  // Find any admin to attribute the decision to. Falls back to a synthetic
  // id if none exist — decided_by is just text, no FK.
  const adminRow = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE is_admin = TRUE ORDER BY created_at ASC LIMIT 1`,
  )
  const adminId = adminRow.rows[0]?.id ?? 'u-e2e-synthetic'
  console.log(`[e2e] decided_by (admin): ${adminId}`)

  // Pre-flight: make sure no existing user has this email (paranoid; the
  // timestamp suffix should already make it unique).
  const dupe = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [testEmail.toLowerCase()],
  )
  if (dupe.rows[0]) {
    console.error(`[e2e] aborting — user with email ${testEmail} already exists (id=${dupe.rows[0].id})`)
    process.exit(2)
  }

  const waitlistId = `w-${randomUUID().slice(0, 12)}`
  await pool.query(
    `INSERT INTO waitlist (id, provider, provider_id, email, display_name, avatar_url, status)
       VALUES ($1, 'google', $2, $3, $4, NULL, 'pending')`,
    [waitlistId, `e2e-google-${stamp}`, testEmail, displayName],
  )
  console.log(`[e2e] inserted waitlist row id=${waitlistId} status=pending`)

  console.log(`[e2e] calling approveWaitlist…`)
  const t0 = Date.now()
  let result: { userId: string; companyId: string | null }
  try {
    result = await approveWaitlist(waitlistId, adminId)
  } catch (e) {
    console.error(`[e2e] approveWaitlist threw:`, e)
    console.error(`[e2e] cleanup: DELETE FROM waitlist WHERE id = '${waitlistId}';`)
    process.exit(1)
  }
  console.log(`[e2e] approveWaitlist returned (${Date.now() - t0} ms):`, result)

  const { userId, companyId } = result

  const user = await pool.query<{
    id: string; email: string; display_name: string; is_admin: boolean
  }>(`SELECT id, email, display_name, is_admin FROM users WHERE id = $1`, [userId])
  console.log(`[e2e] user row:`, user.rows[0])

  const company = await pool.query<{
    id: string; name: string; slug: string; owner_user_id: string
  }>(`SELECT id, name, slug, owner_user_id FROM companies WHERE id = $1`, [companyId])
  console.log(`[e2e] company row:`, company.rows[0])

  const wl = await pool.query<{
    id: string; status: string; decided_at: string | null; decided_by: string | null
  }>(`SELECT id, status, decided_at, decided_by FROM waitlist WHERE id = $1`, [waitlistId])
  console.log(`[e2e] waitlist row (post-approve):`, wl.rows[0])

  const participants = await pool.query<{ id: string; kind: string; name: string }>(
    `SELECT id, kind, name FROM participants WHERE company_id = $1 ORDER BY kind, name`,
    [companyId],
  )
  console.log(`[e2e] participants in company (${participants.rows.length}):`, participants.rows)

  // Print cleanup SQL so the dev DB can be reset by hand.
  console.log(`\n[e2e] === cleanup SQL ===`)
  console.log(`DELETE FROM participants WHERE company_id = '${companyId}';`)
  console.log(`DELETE FROM company_members WHERE company_id = '${companyId}';`)
  console.log(`DELETE FROM companies WHERE id = '${companyId}';`)
  console.log(`DELETE FROM user_identities WHERE user_id = '${userId}';`)
  console.log(`DELETE FROM users WHERE id = '${userId}';`)
  console.log(`DELETE FROM waitlist WHERE id = '${waitlistId}';`)
  console.log(`[e2e] === end cleanup ===\n`)

  console.log(`[e2e] DONE — check the Resend dashboard and ${testEmail} inbox for the welcome email.`)
}

main()
  .then(async () => { await pool.end(); process.exit(0) })
  .catch(async (e) => { console.error('[e2e] FAILED:', e); await pool.end().catch(() => {}); process.exit(1) })
