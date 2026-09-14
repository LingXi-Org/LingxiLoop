import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { register } from 'tsx/esm/api'
import { createLingxiOS } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'

// Public package installation plus the product's actual schema, permissions and Yjs editor.
const connectionString = process.env.LINGXIOS_NATIVE_TEST_DATABASE_URL
assert.ok(connectionString && /^native_/.test(new URL(connectionString).pathname.slice(1)), 'requires an empty disposable database named native_*')
Object.assign(process.env, { DATABASE_URL: connectionString, OPENAI_API_KEY: 'native-check', WUKONG_USER_TOKEN_SECRET: 'native-check-wukong-token',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small', REDIS_URL: process.env.LINGXIOS_NATIVE_TEST_REDIS_URL ?? 'redis://127.0.0.1:56063', R2_ENDPOINT: 'http://127.0.0.1:1', R2_BUCKET: 'native-check',
  R2_ACCESS_KEY_ID: 'native-check', R2_SECRET_ACCESS_KEY: 'native-check', R2_PUBLIC_BASE: 'https://assets.test.invalid',
  R2_URL_SIGNING_SECRET: 'native-check-signing-secret', LINGXILOOP_INVITE_BASE_URL: 'https://app.test.invalid' })
const database = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000 })
const loader = register({ namespace: 'native-document-check' })
const { createDocumentTools } = await loader.import('../server/src/modules/documents/agent-tools.ts', import.meta.url)
const { readDocumentSnapshot } = await loader.import('../server/src/modules/documents/collaboration-application.ts', import.meta.url)
const { calendarTools } = await loader.import('../server/src/modules/calendar/agent-tools.ts', import.meta.url)
const { CalendarApplication } = await loader.import('../server/src/modules/calendar/application.ts', import.meta.url)
const { pollTools } = await loader.import('../server/src/modules/polls/agent-tools.ts', import.meta.url)
const { PollApplication } = await loader.import('../server/src/modules/polls/application.ts', import.meta.url)
const { flushNativeEvents } = await loader.import('../server/src/agents/native-events.ts', import.meta.url)
const { createProductContext } = await loader.import('../server/src/agent-runtime/context.ts', import.meta.url)
const { createProductHarness } = await loader.import('../server/src/agent-runtime/harness.ts', import.meta.url)
const { syncConversationPolicy } = await loader.import('../server/src/agent-runtime/conversations.ts', import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'lingxios-native-document-'))
const imageStorage = { normalizeKey: () => null, keyFromPublicUrl: () => null, signedUrlExpiresSoon: () => false,
  publicUrl: async () => { throw new Error('this text document has no images') } }
let control, worker, currentIdentity, failReceipt = false, mode = 'edit', hop = 0, documentId, firstRevision
const delivered = [], events = []
const query = async (client, sql, params) => {
  if (failReceipt && /INSERT INTO document_updates/.test(sql)) { failReceipt = false; throw new Error('injected document persistence failure') }
  return client.query(sql, params)
}
const pool = { query: (sql, params) => query(database, sql, params), connect: async () => {
  const client = await database.connect()
  return { query: (sql, params) => query(client, sql, params), release: error => client.release(error) }
} }
const usage = { available: true, inputTokens: 100, outputTokens: 50 }
function call(name, args) { return { output: [{ type: 'function_call', callId: `${mode}-${hop}`, name, arguments: JSON.stringify(args) }], text: '', model: 'deterministic-native-check', usage } }
function answer(text) { return { output: [{ role: 'assistant', content: text }], text, model: 'deterministic-native-check', usage } }
const model = {
  modelId: 'deterministic-native-check', contextWindowTokens: 200_000,
  async run() {
    hop++
    if (mode === 'revoked') throw new Error('revoked membership must fail before model execution')
    if (mode === 'poll') {
      if (hop === 1) return call('polls__create', { question: 'Which lesson?', options: ['Algebra','Geometry'] })
      const row = (await database.query('SELECT poll_client_msg_no,poll FROM im_polls')).rows[0]
      if (hop === 2) return call('polls__vote', { messageId: row.poll_client_msg_no, optionIds: [row.poll.options[0].id] })
      if (hop === 3) return call('ipython', { code: `print(host.polls.show(messageId=${JSON.stringify(row.poll_client_msg_no)}))` })
      return answer('The poll is created and I voted for Algebra.')
    }
    if (mode === 'calendar') {
      const input = { title: 'Lesson', startAt: '2027-01-02T10:00:00Z' }
      if (hop === 1) return call('calendar__create', { ...input, startAt: 'invalid-date' })
      if (hop === 2) return call('calendar__create', input)
      const eventId = (await database.query('SELECT id FROM calendar_events')).rows[0].id
      const app = new CalendarApplication(database, { publish: async () => {} }, { dispatch: async () => { throw new Error('not dispatched by fixture') } })
      if (hop === 3) return call('calendar__update', { eventId, expected: await app.get({ companyId: 't', projectId: 'p', userId: 'human' }, eventId), patch: { title: 'Updated lesson' } })
      if (hop === 4) return call('ipython', { code: `print(host.calendar.get(eventId=${JSON.stringify(eventId)}))` })
      return answer('The approved calendar event is created and renamed Updated lesson.')
    }
    if (mode === 'delete') {
      if (hop === 1) return call('documents__delete', { documentId, expectedRevision: (await readDocumentSnapshot(database, documentId, 't')).revision })
      return answer('The approved document was deleted.')
    }
    if (hop === 1) return call('documents__create', { title: 42, body: 'Invalid.' })
    if (hop === 2) {
      assert.equal((await control.readDiagnostics(currentIdentity)).actions.length, 0)
      return call('documents__create', { title: 'Lesson', body: 'Original paragraph.' })
    }
    const document = (await database.query('SELECT id,created_by FROM documents')).rows[0]
    assert.equal(document.created_by, 'agent')
    documentId = document.id
    const snapshot = await readDocumentSnapshot(database, documentId, 't')
    if (hop === 3) { firstRevision = snapshot.revision; failReceipt = true }
    if (hop === 4) { assert.match(snapshot.body, /Original paragraph/); assert.equal(snapshot.revision, firstRevision) }
    if (hop === 3 || hop === 4) return call('documents__edit', { documentId, expectedRevision: firstRevision,
      operations: [{ kind: 'replace', find: 'Original', replace: 'Updated' }, { kind: 'append', text: 'Second paragraph.' }] })
    if (hop === 5) {
      // The other tool channel reaches exactly the same executor and native read path.
      return call('ipython', { code: `print(host.documents.read(documentId=${JSON.stringify(documentId)}))` })
    }
    assert.ok(hop < 12, 'completion must not loop')
    return answer('Created Lesson and updated its two paragraphs. The current document is attached.')
  },
  async structured(request) {
    assert.match(request.instructions, /Check a candidate delivery/)
    assert.ok(request.input.fileObservations.every(item => item.status === 'passed'), JSON.stringify(request.input.fileObservations))
    return { value: { missing: [] }, model: 'deterministic-content-check', usage }
  },
  async compact() { throw new Error('this bounded fixture must not compact') },
}
try {
  assert.equal((await database.query("SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows.length, 0, 'requires an empty disposable database')
  const { migrateDatabase, assertMigrationsCurrent } = await loader.import('../server/src/db/migrate.ts', import.meta.url)
  await migrateDatabase(database)
  await assertMigrationsCurrent(database)
  await database.query(`
    INSERT INTO users(id,email,display_name) VALUES('human','human@test.invalid','Human');
    INSERT INTO companies(id,name,slug,type,plan_id) VALUES('t','Native tools','native-tools','EDUCATION','plan-education');
    INSERT INTO company_memberships(company_id,user_id,role,status) VALUES('t','human','STUDENT','ACTIVE');
    INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
      VALUES('contract','t','plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year',10);
    INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES('seat-human','t','contract','human','ACTIVE');
    WITH period AS (INSERT INTO company_membership_periods(membership_id,role) SELECT id,role FROM company_memberships RETURNING id,membership_id)
    UPDATE company_memberships member SET period_id=period.id FROM period WHERE member.id=period.membership_id;
    INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('p','t','INSTITUTIONAL_COURSE','Docs','human');
    INSERT INTO courses(id,company_id,project_id,created_by) VALUES('course','t','p','human');
    INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES('t','p','human','STUDENT','ACTIVE');
    INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities)
      VALUES('agent','t','agent','Agent','A','blue','avail','["documents","calendar"]'),('human','t','human','Human','H','blue','avail','[]');
    INSERT INTO conversations(id,kind,title,company_id,project_id,members,leader_id) VALUES('room','group','Room','t','p','["human","agent"]','human');
    INSERT INTO im_channel_bindings(company_id,channel_id,profile) VALUES('t','room','{"channelId":"room","channelType":2,"members":["human","agent"]}');
  `)
  const tools = [...createDocumentTools(imageStorage), ...calendarTools, ...pollTools]
  const options = { database: pool, harness: createProductHarness(tools), ...createProductContext(tools), homesRoot: directory,
    modelBudget: { maxModelCalls: 24 }, delivery: { onEvent: async (_work, event, context) => { context.signal.throwIfAborted(); events.push(event) },
      deliverMessage: async (_work, message, context) => { context.signal.throwIfAborted(); delivered.push(message); return { messageId: context.im.messageKey } } } }
  control = await createLingxiOS(options)
  const policy = await syncConversationPolicy(control,'t','room')
  async function enqueue(messageId,text) {
    const accepted = await control.conversations.ingest({ tenantId: 't',conversationId: 'room',policyVersion: policy.version,
      messageId,version: 1,author: { id: 'human',kind: 'human' },text,mentions: ['agent'] },{ mode: 'execute',executionClass: 'operation' })
    assert.equal(accepted.runs.length,1)
    currentIdentity = accepted.runs[0]
    assert.notEqual(currentIdentity.sessionId,'room')
    return currentIdentity
  }
  assert.equal('runNext' in control, false)
  worker = createWorker({ controlPlane: control, model, kernel: { homesRoot: directory }, worker: { id: 'native-document-one' } })
  const identity = await enqueue('document-edit','Create Lesson, change Original to Updated, append Second paragraph, and attach its current contents.')
  assert.equal(await worker.runNext(), true)
  const message = await control.readMessage(identity)
  assert.ok(message, JSON.stringify(await control.readRun(identity)))
  assert.equal(message.envelope.goalOutcome.status, 'satisfied', JSON.stringify(message.envelope))
  const artifact = message.envelope.artifacts[0]
  assert.ok(artifact.source.version)
  const download = await control.readArtifact(identity, artifact.path)
  assert.ok(download)
  assert.match(download.bytes.toString(), /Updated paragraph\./)
  assert.match(download.bytes.toString(), /Second paragraph\./)
  assert.equal(createHash('sha256').update(download.bytes).digest('hex'), artifact.sha256)
  await assert.rejects(control.readArtifact({ ...identity, principalId: 'foreign' }, artifact.path), /capability is unavailable/)
  assert.equal(await control.readArtifact({ ...identity, tenantId: 'foreign' }, artifact.path), null)
  assert.equal(await control.readArtifact(identity, '../document.md'), null)
  const deadline = Date.now() + 10_000
  while (await control.readDelivery(identity) !== 'delivered' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(await control.readDelivery(identity), 'delivered')
  assert.equal(delivered.length, 1)
  assert.deepEqual(delivered[0].envelope.artifacts, message.envelope.artifacts)
  const receipts = (await control.readDiagnostics(identity)).actions.filter(row => row.action.startsWith('documents.'))
  assert.equal(receipts.filter(row => row.result.executionState === 'no_effect').length, 1)
  assert.equal((await database.query('SELECT id FROM documents')).rows.length,1)
  assert.ok((await control.readEvents(identity)).events.some(event => event.data.name === 'documents.read'))

  mode = 'revoked'; hop = 0
  const beforeRevocation = await readDocumentSnapshot(database,documentId,'t')
  await database.query("UPDATE project_memberships SET status='SUSPENDED'")
  const revoked = await enqueue('revoked-document','Append Forbidden to the document.')
  assert.equal(await worker.runNext(),true)
  assert.equal((await control.readRun(revoked)).status,'failed')
  assert.deepEqual(await readDocumentSnapshot(database,documentId,'t'),beforeRevocation)
  assert.equal(hop,0)
  await database.query("UPDATE project_memberships SET status='ACTIVE'")

  mode = 'delete'; hop = 0
  const deletion = await enqueue('document-delete','Delete the Lesson document after my approval.')
  assert.equal(await worker.runNext(), true)
  const waiting = await control.readOutcome(deletion)
  assert.equal(waiting?.status, 'awaiting_approval')
  const decision = { ...deletion, approvalId: waiting.approvalId, approved: true }
  assert.ok((await control.readApproval(decision)).preview.bodySha256)
  await assert.rejects(control.decideApproval({ ...decision, principalId: 'foreign' }), /outside this principal/)
  await worker.stop()
  await control.decideApproval(decision)
  worker = createWorker({ controlPlane: control, model, kernel: { homesRoot: directory }, worker: { id: 'native-document-two' } })
  assert.equal(await worker.runNext(), true)
  assert.equal((await database.query('SELECT id FROM documents')).rows.length, 0)
  assert.equal((await database.query('SELECT id FROM document_updates')).rows.length, 0)
  assert.equal((await control.readOutcome(deletion))?.status, 'satisfied')
  assert.ok((await database.query("SELECT id FROM agent_native_event_outbox WHERE event->>'kind'='document.deleted'")).rows.length)

  mode = 'poll'; hop = 0
  const pollIdentity = await enqueue('native-poll','Create a poll with Algebra and Geometry, and vote for Algebra.')
  assert.equal(await worker.runNext(), true)
  assert.equal((await control.readOutcome(pollIdentity))?.status, 'satisfied')
  assert.equal((await database.query('SELECT voter_participant_id FROM im_poll_votes')).rows[0].voter_participant_id, 'agent')
  const publications = []
  const polls = new PollApplication(database, { transaction: work => work(database), publishSnapshot: async row => { publications.push(row); return 1 } })
  assert.equal(await polls.reconcilePendingPublications(), 1)
  assert.equal(await polls.reconcilePendingPublications(), 0)
  assert.equal(publications.length, 1)

  mode = 'calendar'; hop = 0
  const calendarIdentity = await enqueue('native-calendar','Create a Lesson calendar event on January 2, 2027 at 10:00 UTC after approval, then rename it Updated lesson.')
  assert.equal(await worker.runNext(), true)
  const calendarWaiting = await control.readOutcome(calendarIdentity)
  assert.equal(calendarWaiting.status, 'awaiting_approval')
  await control.decideApproval({ ...calendarIdentity, approvalId: calendarWaiting.approvalId, approved: true })
  assert.equal(await worker.runNext(), true)
  assert.equal((await control.readOutcome(calendarIdentity))?.status, 'satisfied')
  assert.deepEqual((await database.query('SELECT title,created_by FROM calendar_events')).rows, [{ title: 'Updated lesson', created_by: 'human' }])
  const nativeEvents = []
  await flushNativeEvents(database, async event => { nativeEvents.push(event) }, new AbortController().signal)
  assert.ok(nativeEvents.some(event => event.type === 'calendar.changed' && event.actorId === 'agent'))
  assert.equal((await database.query('SELECT id FROM agent_native_event_outbox WHERE delivered_at IS NULL')).rows.length, 0)
  console.log('Public tarball + real PostgreSQL: document, calendar and poll tools; both channels; atomic receipts; permission revocation; cross-worker approval; downloaded bytes; native event and message delivery receipts passed.')
} finally {
  await worker?.stop()
  await control?.stop()
  await database.end()
  const { pool: productPool } = await loader.import('../server/src/db/pool.ts', import.meta.url)
  await productPool.end()
  const { redis, sub } = await loader.import('../server/src/redis.ts', import.meta.url)
  redis.disconnect(); sub.disconnect()
  await loader.unregister()
  await rm(directory, { recursive: true, force: true })
}
