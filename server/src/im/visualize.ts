import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { projectGenUiReferences } from '../../../src/features/chat/visualize/zcode/gen-ui/domain/references.js'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { withTransaction } from '../db/transaction.js'
import { HttpError } from '../http/errors.js'
import { createPermissionService } from '../modules/access/public.js'
import { genUiWidgetStateSchema, type GenUiWidgetState } from '../../../src/features/chat/visualize/zcode/shared/gen-ui/contract.js'
import { createNativeMessage, nativeMessageSchema, type NativeMessage } from './message-types.js'
import { messageAcceptanceDigest } from './messages-digest.js'
import { acceptSend, ensureSendAcceptance, getSendAcceptance, SEND_NOT_DISPATCHED } from './messages-repository.js'

export interface VisualizeActor { companyId: string; channelId: string; userId: string }
export interface VisualizePageActor extends VisualizeActor { pageId: string; token: string }
interface DocumentRow { path: string; html: string; version: number; run_id: string; agent_id: string; created_by: string; source_hash: string }
interface PageRow { id: string; path: string; document_version: number; source_message_id: string; agent_id: string; run_id: string }
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export function visualizeOutputDirectory(input: Pick<VisualizeActor, 'companyId' | 'channelId'>): string {
  return resolve(process.env.AGENT_OS_HOMES_ROOT?.trim() || '.agent-os/homes', 'visualize', digest(JSON.stringify([input.companyId, input.channelId])))
}
function checkedPath(input: VisualizeActor & { path: string }): string {
  const root = visualizeOutputDirectory(input)
  if (dirname(input.path) !== root || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(input.path.slice(root.length + 1))) throw new HttpError(403, 'Visualize path is outside this conversation.')
  return input.path
}
export async function assertVisualizeActor(db: Queryable, input: VisualizeActor, action: 'conversation:read' | 'conversation:write' = 'conversation:read') {
  await createPermissionService(db, { lockDependencies: db !== pool }).assertCan({ companyId: input.companyId, actorUserId: input.userId, action, resource: { type: 'conversation', id: input.channelId } })
  const { assertTeacherRoomAccessible } = await import('../modules/learning/public.js')
  await assertTeacherRoomAccessible(input.channelId, input.companyId, input.userId, db)
  const result = await db.query(`SELECT 1 FROM conversations room JOIN participants person ON person.company_id=room.company_id
    AND person.id=$3 AND person.kind='human' AND person.departed_at IS NULL WHERE room.company_id=$1 AND room.id=$2
    AND room.members @> to_jsonb(ARRAY[$3::text])${db === pool ? '' : ' FOR SHARE OF room,person'}`, [input.companyId, input.channelId, input.userId])
  if (!result.rows.length) throw new HttpError(403, 'Visualize requires current conversation membership.')
}
async function lock(db: Queryable, input: VisualizeActor) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['visualize', input.companyId, input.userId])])
}
async function document(db: Queryable, input: VisualizeActor & { path: string }) {
  checkedPath(input)
  const row = (await db.query<DocumentRow>(`SELECT * FROM im_visualize_documents WHERE company_id=$1 AND channel_id=$2 AND path=$3${db === pool ? '' : ' FOR SHARE'}`, [input.companyId, input.channelId, input.path])).rows[0]
  if (!row) throw new HttpError(404, 'Visualize document not found.')
  return row
}
/** Files are an executor mirror only. All product reads are from authorized PostgreSQL rows. */
async function ensureOutputDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  let current: string = sep
  for (const segment of directory.split(sep).filter(Boolean)) {
    current = join(current, segment)
    if ((await lstat(current)).isSymbolicLink()) throw new HttpError(403, 'Visualize output cannot contain symbolic links.')
  }
  if (await realpath(directory) !== directory) throw new HttpError(403, 'Invalid Visualize output directory.')
}
export async function ensureVisualizeOutputDirectory(input: VisualizeActor) {
  await assertVisualizeActor(pool, input, 'conversation:write')
  const directory = visualizeOutputDirectory(input)
  await ensureOutputDirectory(directory)
  return directory
}
async function mirror(path: string, html: string) {
  const directory = dirname(path)
  await ensureOutputDirectory(directory)
  const temporary = join(directory, `.visualize-${randomUUID()}`)
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(html, 'utf8'); await handle.sync() } finally { await handle.close() }
  try { await rename(temporary, path) } finally { await unlink(temporary).catch(() => {}) }
}
export async function saveVisualizeDocument(input: VisualizeActor & { runId: string; agentId: string; name: string; html: string; database?: Queryable }) {
  const name = input.name.replace(/\.html$/, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 150 || typeof input.html !== 'string'
    || Buffer.byteLength(input.html) > 5_000_000 || /<(?:!doctype\b|\/?(?:html|head|body)(?:\s|>))/iu.test(input.html)) throw new HttpError(400, 'Expected a bounded HTML fragment and lowercase-hyphenated name.')
  const path = join(visualizeOutputDirectory(input), `${name}.html`)
  const save = async (db: Queryable) => {
    await assertVisualizeActor(db, input, 'conversation:write'); await lock(db, input)
    const binding = await db.query(`SELECT 1 FROM agent_run_bindings run JOIN conversations room ON room.company_id=run.company_id AND room.id=run.conversation_id
      JOIN participants agent ON agent.company_id=run.company_id AND agent.id=run.agent_id AND agent.kind='agent' AND agent.departed_at IS NULL
      WHERE run.run_id=$1 AND run.company_id=$2 AND run.conversation_id=$3 AND run.principal_id=$4 AND run.agent_id=$5
      AND NOT run.internal AND run.message_protocol=2 AND room.members @> to_jsonb(ARRAY[$5::text])`, [input.runId, input.companyId, input.channelId, input.userId, input.agentId])
    if (!binding.rows.length) throw new HttpError(403, 'Visualize output does not belong to this acting user and run.')
    const previous = (await db.query<DocumentRow>('SELECT * FROM im_visualize_documents WHERE company_id=$1 AND channel_id=$2 AND path=$3 FOR UPDATE', [input.companyId, input.channelId, path])).rows[0]
    if (previous && (previous.created_by !== input.userId || previous.agent_id !== input.agentId)) throw new HttpError(403, 'Cannot overwrite another author’s visualization.')
    await mirror(path, input.html)
    await db.query(`INSERT INTO im_visualize_documents(company_id,channel_id,path,run_id,agent_id,created_by,html,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(company_id,channel_id,path) DO UPDATE SET html=EXCLUDED.html,
      source_hash=EXCLUDED.source_hash,run_id=EXCLUDED.run_id,version=im_visualize_documents.version+1,updated_at=clock_timestamp()
      WHERE im_visualize_documents.source_hash<>EXCLUDED.source_hash OR im_visualize_documents.run_id<>EXCLUDED.run_id`, [input.companyId, input.channelId, path, input.runId, input.agentId, input.userId, input.html, digest(input.html)])
  }
  if (input.database) await save(input.database)
  else await withTransaction(pool, save)
  return { path, html: input.html }
}
export async function readAuthorizedVisualizeDocument(input: VisualizeActor & { path: string }) {
  await assertVisualizeActor(pool, input)
  const row = await document(pool, input)
  return { path: row.path, html: row.html }
}
export async function getVisualizeStateSnapshot(input: VisualizeActor & { path: string }, db: Queryable = pool): Promise<{state: GenUiWidgetState | null; revision: number}> {
  await assertVisualizeActor(db, input); await document(db, input)
  const row = (await db.query<{state: GenUiWidgetState | null; revision: string}>(`SELECT saved.state,
    COALESCE((extract(epoch from COALESCE(saved.updated_at,(SELECT max(updated_at) FROM im_visualize_states
      WHERE company_id=$1 AND channel_id=$2 AND user_id=$4)))*1000000)::bigint,0) revision
    FROM (SELECT 1) anchor LEFT JOIN im_visualize_states saved ON saved.company_id=$1 AND saved.channel_id=$2 AND saved.path=$3 AND saved.user_id=$4`,
    [input.companyId, input.channelId, input.path, input.userId])).rows[0]
  return {state: row.state, revision: Number(row.revision)}
}
export async function getVisualizeState(input: VisualizeActor & { path: string }, db: Queryable = pool) {
  return (await getVisualizeStateSnapshot(input, db)).state
}
export async function listVisualizeModelState(input: VisualizeActor) {
  await assertVisualizeActor(pool, input)
  const rows = (await pool.query<{path: string; state: {modelContent: unknown}}>(`SELECT path,jsonb_build_object('modelContent',state->'modelContent') state
    FROM im_visualize_states WHERE company_id=$1 AND channel_id=$2 AND user_id=$3 ORDER BY path LIMIT 100`, [input.companyId, input.channelId, input.userId])).rows
  return rows.filter(row => row.state.modelContent !== null)
}
function referencesPath(payload: NativeMessage, path: string) {
  return payload.content.some(part => part.type === 'text' && projectGenUiReferences(part.text, true).some(item => item.kind === 'ui' && item.reference.path === path))
}
export async function createVisualizePage(input: VisualizeActor & { request: unknown }) {
  const request = z.object({ path: z.string().max(4096), sourceMessageId: z.string().min(1).max(300), instanceKey: z.string().min(1).max(1024) }).strict().parse(input.request)
  await assertVisualizeActor(pool, input)
  const source = await document(pool, { ...input, path: request.path })
  // Message admission imports Visualize before the message facade initializes.
  const { imMessagesApplication } = await import('./messages-facade.js')
  const messages = await imMessagesApplication.readMessages({ ...input, messageIds: [request.sourceMessageId] })
  const message = messages?.find(item => item.messageId === request.sourceMessageId || item.clientMsgNo === request.sourceMessageId)
  if (!message || message.payload.role !== 'assistant' || message.payload.status.type !== 'complete' || message.fromUid !== source.agent_id || message.payload.metadata.custom.runId !== source.run_id || !referencesPath(message.payload, source.path)) throw new HttpError(403, 'Visualize requires a delivered assistant reference.')
  return withTransaction(pool, async db => {
    await assertVisualizeActor(db, input); await lock(db, input)
    const current = await document(db, { ...input, path: request.path })
    if (current.version !== source.version) throw new HttpError(409, 'Visualize document changed.')
    await db.query(`UPDATE im_visualize_pages page SET revoked_at=NOW() WHERE company_id=$1 AND user_id=$2 AND revoked_at IS NULL
      AND (expires_at<=NOW() OR (channel_id=$3 AND instance_key=$4) OR NOT EXISTS (SELECT 1 FROM im_visualize_documents doc
        JOIN conversations room ON room.company_id=doc.company_id AND room.id=doc.channel_id WHERE doc.company_id=page.company_id
        AND doc.channel_id=page.channel_id AND doc.path=page.path AND doc.version=page.document_version AND room.project_id IS NOT DISTINCT FROM page.project_id))`, [input.companyId, input.userId, input.channelId, request.instanceKey])
    const count = (await db.query<{count: string}>('SELECT count(*) FROM im_visualize_pages WHERE company_id=$1 AND user_id=$2 AND revoked_at IS NULL', [input.companyId, input.userId])).rows[0]
    if (Number(count.count) >= 64) throw new HttpError(429, 'Visualize page capacity reached.')
    const pageId = randomUUID(), initId = randomUUID()
    await db.query(`INSERT INTO im_visualize_pages(id,company_id,channel_id,path,user_id,token_hash,instance_key,document_version,source_message_id,project_id)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,project_id FROM conversations WHERE company_id=$2 AND id=$3`, [pageId, input.companyId, input.channelId, source.path, input.userId, digest(initId), request.instanceKey, source.version, message.messageId])
    const snapshot = await getVisualizeStateSnapshot({ ...input, path: source.path }, db)
    return { pageId, initId, path: source.path, html: source.html, state: snapshot.state, stateRevision: snapshot.revision }
  })
}
export async function assertVisualizePage(db: Queryable, input: VisualizePageActor, write = false): Promise<PageRow> {
  await assertVisualizeActor(db, input, write ? 'conversation:write' : 'conversation:read')
  const row = (await db.query<PageRow>(`SELECT page.*,doc.agent_id,doc.run_id FROM im_visualize_pages page JOIN im_visualize_documents doc
    ON doc.company_id=page.company_id AND doc.channel_id=page.channel_id AND doc.path=page.path
    JOIN conversations room ON room.company_id=page.company_id AND room.id=page.channel_id
    WHERE room.members @> to_jsonb(ARRAY[$4::text]) AND page.project_id IS NOT DISTINCT FROM room.project_id AND page.id=$1 AND page.company_id=$2 AND page.channel_id=$3 AND page.user_id=$4 AND page.token_hash=$5
    AND page.revoked_at IS NULL AND page.expires_at>NOW() AND page.document_version=doc.version FOR SHARE OF page,doc,room`, [input.pageId, input.companyId, input.channelId, input.userId, digest(input.token)])).rows[0]
  if (!row) throw new HttpError(410, 'Visualize page is invalid or expired.')
  return row
}
export async function readVisualizePageState(input: VisualizePageActor) {
  return withTransaction(pool, async db => {
    const page = await assertVisualizePage(db, input)
    return getVisualizeStateSnapshot({ ...input, path: page.path }, db)
  })
}
export async function saveVisualizePageState(input: VisualizePageActor & { state: unknown }) {
  const state = genUiWidgetStateSchema.parse(input.state)
  return withTransaction(pool, async db => {
    await assertVisualizeActor(db, input, 'conversation:write'); await lock(db, input)
    const page = await assertVisualizePage(db, input, true)
    await db.query(`INSERT INTO im_visualize_states(company_id,channel_id,path,user_id,state) VALUES($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(company_id,channel_id,path,user_id) DO UPDATE SET state=EXCLUDED.state,updated_at=GREATEST(clock_timestamp(),im_visualize_states.updated_at+INTERVAL '1 microsecond')`, [input.companyId, input.channelId, page.path, input.userId, JSON.stringify(state)])
    await db.query(`DELETE FROM im_visualize_states WHERE company_id=$1 AND channel_id=$2 AND user_id=$3 AND path IN
      (SELECT path FROM im_visualize_states WHERE company_id=$1 AND channel_id=$2 AND user_id=$3 ORDER BY updated_at DESC,path OFFSET 100)`, [input.companyId, input.channelId, input.userId])
    return getVisualizeStateSnapshot({ ...input, path: page.path }, db)
  })
}
export async function closeVisualizePage(input: VisualizePageActor) {
  await withTransaction(pool, async db => {
    await assertVisualizeActor(db, input); await lock(db, input)
    const result = await db.query(`UPDATE im_visualize_pages SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1
      AND company_id=$2 AND channel_id=$3 AND user_id=$4 AND token_hash=$5 RETURNING id`, [input.pageId, input.companyId, input.channelId, input.userId, digest(input.token)])
    if (!result.rows.length) throw new HttpError(410, 'Visualize page is invalid.')
  })
}
export async function mintVisualizeGesture(input: VisualizePageActor) {
  return withTransaction(pool, async db => {
    await assertVisualizeActor(db, input, 'conversation:write'); await lock(db, input); await assertVisualizePage(db, input, true)
    const gestureToken = randomUUID()
    await db.query('DELETE FROM im_visualize_gestures WHERE page_id=$1', [input.pageId])
    await db.query('INSERT INTO im_visualize_gestures(token_hash,page_id) VALUES($1,$2)', [digest(gestureToken), input.pageId])
    return { gestureToken }
  })
}
async function consumeGesture(db: Queryable, input: VisualizePageActor, token: string) {
  const result = await db.query(`UPDATE im_visualize_gestures SET consumed_at=NOW() WHERE token_hash=$1 AND page_id=$2 AND consumed_at IS NULL AND expires_at>NOW() RETURNING token_hash`, [digest(token), input.pageId])
  if (!result.rows.length) throw new HttpError(403, 'A fresh user gesture is required.')
}
export async function openVisualizeExternal(input: VisualizePageActor & { request: unknown }) {
  const request = z.object({ href: z.string().max(4096), gestureToken: z.string().uuid() }).strict().parse(input.request)
  let url: URL
  try { url = new URL(request.href) } catch { throw new HttpError(400, 'Invalid external URL.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /[\x00-\x20\x7f]/.test(request.href)) throw new HttpError(403, 'External URL is not permitted.')
  await withTransaction(pool, async db => { await assertVisualizeActor(db, input, 'conversation:write'); await lock(db, input); await assertVisualizePage(db, input, true); await consumeGesture(db, input, request.gestureToken) })
  return { href: url.href }
}
export async function submitVisualizeFollowUp(input: VisualizePageActor & { request: unknown }) {
  const request = z.object({ prompt: z.string().trim().min(1).max(65536), title: z.string().max(250).optional(), gestureToken: z.string().uuid(), idempotencyKey: z.string().min(1).max(200) }).strict().parse(input.request)
  const clientNonce = `visualize-${digest(JSON.stringify([input.companyId, input.channelId, input.userId, input.pageId, request.idempotencyKey]))}`
  const admission = await withTransaction(pool, async db => {
    await assertVisualizeActor(db, input, 'conversation:write'); await lock(db, input)
    const page = await assertVisualizePage(db, input, true)
    const identity = { ...input, clientNonce }
    const metadata = { path: page.path, pageId: page.id, documentVersion: page.document_version, prompt: request.prompt, ...(request.title ? { title: request.title } : {}) }
    const previous = await getSendAcceptance(db, identity)
    if (previous) {
      if (!isDeepStrictEqual(nativeMessageSchema.parse(previous.payload).metadata.custom.visualizeFollowUp, metadata)) throw new HttpError(409, 'Follow-up idempotency key conflicts.')
      return { previous, payload: nativeMessageSchema.parse(previous.payload), fresh: previous.error === SEND_NOT_DISPATCHED }
    }
    await consumeGesture(db, input, request.gestureToken)
    const run = (await db.query<{thread_id: string | null}>(`SELECT run.thread_id FROM agent_run_bindings run JOIN participants agent ON agent.company_id=run.company_id AND agent.id=run.agent_id
      JOIN conversations room ON room.company_id=run.company_id AND room.id=run.conversation_id WHERE run.run_id=$1 AND run.company_id=$2 AND run.conversation_id=$3
      AND agent.kind='agent' AND agent.departed_at IS NULL AND room.members @> to_jsonb(ARRAY[run.agent_id]) FOR SHARE OF run,agent,room`, [page.run_id, input.companyId, input.channelId])).rows[0]
    if (!run) throw new HttpError(410, 'Visualize source run is unavailable.')
    const payload = createNativeMessage({ id: clientNonce, role: 'user', content: [{ type: 'text', text: request.prompt }], custom: { visualizeFollowUp: metadata, mentionedIds: [page.agent_id], ...(run.thread_id ? {replyToClientMsgNo: run.thread_id} : {}) } })
    const binding = (await db.query<{channel_type: number}>(`SELECT COALESCE((profile->>'channelType')::int,2) channel_type FROM im_channel_bindings WHERE company_id=$1 AND channel_id=$2`, [input.companyId, input.channelId])).rows[0]
    if (!binding) throw new HttpError(404, 'Conversation not found.')
    await ensureSendAcceptance(db, { ...identity, channelType: binding.channel_type, payload, inputDigest: messageAcceptanceDigest({ channelId: input.channelId, channelType: binding.channel_type, payload }) })
    return { previous: null, payload, fresh: true }
  })
  if (admission.previous?.status === 'accepted' && admission.previous.echo) return { status: 'accepted', duplicate: true, echo: admission.previous.echo }
  const { imMessagesApplication } = await import('./messages-facade.js')
  if (!admission.fresh) {
    const messages = await imMessagesApplication.readMessages({ ...input, messageIds: [clientNonce] })
    const message = messages?.find(item => item.clientMsgNo === clientNonce)
    if (!message) throw new HttpError(409, 'Follow-up delivery is pending reconciliation.')
    if (message.fromUid !== input.userId || messageAcceptanceDigest({ channelId: input.channelId, channelType: message.channelType, payload: message.payload }) !== admission.previous!.input_digest) throw new HttpError(409, 'Follow-up receipt conflicts.')
    await acceptSend(pool, { ...input, clientNonce, echo: message })
    return { status: 'accepted', duplicate: true, echo: message }
  }
  await assertVisualizePage(pool, input, true)
  const result = await imMessagesApplication.acceptUserMessage({ ...input, clientNonce, payload: admission.payload })
  if (result.kind !== 'accepted') throw new HttpError(409, 'Follow-up was not accepted.')
  return { status: 'accepted', duplicate: result.duplicate, echo: result.echo }
}
export async function readVisualizeResource(input: VisualizePageActor & { name: string }) {
  await assertVisualizePage(pool, input)
  const root = resolve('third_party/zcode/skills/visualize/assets')
  const runtime = JSON.parse(await readFile(join(root, 'runtime-manifest.json'), 'utf8')) as { files: Record<string, {sha256: string}> }
  const vendor = JSON.parse(await readFile(join(root, 'vendor/manifest.json'), 'utf8')) as unknown
  const allowed = new Map(Object.entries(runtime.files).map(([name, value]) => [name, value.sha256]))
  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(collect); return }
    const item = value as Record<string, unknown>
    if (typeof item.file === 'string' && typeof item.sha256 === 'string') allowed.set(`vendor/${item.file}`, item.sha256)
    Object.values(item).forEach(collect)
  }
  collect(vendor)
  if (input.name === 'gen-ui.js') {
    const bundled = JSON.parse(await readFile(resolve('server/assets/visualize-runtime/manifest.json'), 'utf8')) as {files: Record<string, {sha256: string}>}
    allowed.set('gen-ui.js', bundled.files['gen-ui.js'].sha256)
  }
  const hash = allowed.get(input.name)
  if (!hash || !/^[a-zA-Z0-9/_.,-]+$/.test(input.name) || input.name.split('/').some(part => part === '..' || part === '.')) throw new HttpError(403, 'Unknown Visualize resource.')
  const file = input.name === 'gen-ui.js' ? resolve('server/assets/visualize-runtime/gen-ui.js') : input.name === 'tweak.js' ? resolve('third_party/zcode/upstream/packages/desktop/src/renderer/src/plugin-sandbox/genUiTweakRuntime.js') : resolve(root, input.name)
  if ((!['tweak.js', 'gen-ui.js'].includes(input.name) && !file.startsWith(`${root}${sep}`)) || (await lstat(file)).isSymbolicLink() || await realpath(file) !== file) throw new HttpError(403, 'Invalid Visualize resource.')
  const bytes = await readFile(file)
  if (digest(bytes.toString('utf8')) !== hash) throw new HttpError(503, 'Visualize resource integrity failed.')
  await assertVisualizePage(pool, input)
  return { bytes, mime: input.name.endsWith('.css') ? 'text/css' : input.name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }
}
