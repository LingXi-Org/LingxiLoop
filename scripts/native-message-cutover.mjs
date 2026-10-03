// Run only with Web/API, Workers and WuKongIM stopped and verified backups retained.
// Accepts an existing pg client so rehearsal and production execute identical SQL.
export async function resetMessageState(client, apply = false) {
  const emptied = [
    'public.im_send_acceptances', 'public.wukong_webhook_receipts',
    'public.message_reactions', 'public.conversation_reads', 'public.im_read_receipt_advances',
    'public.lingxios_ingress_outbox', 'lingxios.agent_reply_slots', 'lingxios.agent_im_messages',
    'lingxios.agent_delivery_outbox', 'lingxios.agent_claim_requests',
    'lingxios.agent_os_session_leases', 'lingxios.agent_os_session_routes',
    'lingxios.agent_os_workers', 'lingxios.agent_inbox_events',
  ]
  const counts = async () => {
    const tables = (await client.query(`SELECT schemaname,tablename FROM pg_tables
      WHERE schemaname IN ('public','lingxios') ORDER BY schemaname,tablename`)).rows
    const result = {}
    for (const { schemaname, tablename } of tables) {
      const name = `${schemaname}.${tablename}`
      if (!/^[a-z_0-9]+\.[a-z_0-9]+$/.test(name)) throw new Error('unexpected table identifier')
      result[name] = Number((await client.query(`SELECT count(*) AS n FROM ${name}`)).rows[0].n)
    }
    return result
  }
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'")
    await client.query('SELECT pg_advisory_xact_lock(20261002,2)')
    await client.query(`LOCK TABLE ${emptied.join(',')}, public.agent_native_event_outbox,
      lingxios.agent_work_items,lingxios.agent_os_sessions,lingxios.agent_run_events IN ACCESS EXCLUSIVE MODE`)
    const before = await counts(), deleted = {}
    // Cancel unfinished work through the schema's normal audit/memory triggers.
    const cancelled = (await client.query(`UPDATE lingxios.agent_work_items SET status='cancelled',
      cancel_requested_at=COALESCE(cancel_requested_at,NOW()),finished_at=NOW(),updated_at=NOW(),
      fence=fence+1,lease_token_hash=NULL,leased_by=NULL,lease_expires_at=NULL,
      error='Message protocol cutover' WHERE status IN ('queued','leased','waiting')`)).rowCount
    for (const table of emptied) deleted[table] = (await client.query(`DELETE FROM ${table}`)).rowCount
    deleted['public.agent_native_event_outbox'] = (await client.query(`DELETE FROM agent_native_event_outbox
      WHERE event->>'type' IN ('im.system','im.membership','im.read_receipt','message.reactions','im.clear_hold')`)).rowCount
    await client.query(`UPDATE lingxios.agent_run_events SET delivery_work=NULL,claim_token=NULL,
      failed_at=COALESCE(failed_at,NOW()),last_error='Message protocol cutover' WHERE delivery_work IS NOT NULL`)
    await client.query(`UPDATE lingxios.agent_os_sessions SET history='[]',summary=NULL,prompt_context=NULL,
      request_snapshot=NULL,applied_work_ids='[]',revision=revision+1,compaction_epoch=compaction_epoch+1,updated_at=NOW()
      WHERE history<>'[]'::jsonb OR summary IS NOT NULL OR prompt_context IS NOT NULL OR request_snapshot IS NOT NULL`)
    const protocolColumn = (await client.query(`SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='agent_run_bindings' AND column_name='message_protocol'`)).rowCount
    if (protocolColumn) await client.query('UPDATE agent_run_bindings SET message_protocol=1 WHERE message_protocol<>1')
    await client.query('UPDATE im_polls SET published_revision=revision,wukong_message_id=NULL')
    const after = await counts()
    for (const [table, count] of Object.entries(before)) {
      if (!emptied.includes(table) && table !== 'public.agent_native_event_outbox' && after[table] < count) {
        throw new Error(`protected table decreased: ${table}`)
      }
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK')
    return { applied: apply, cancelled, deleted, before, after }
  } catch (error) { await client.query('ROLLBACK'); throw error }
}
