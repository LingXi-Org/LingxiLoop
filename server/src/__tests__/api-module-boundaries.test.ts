import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const domains = [
  'platform',
  'identity',
  'companies',
  'canvas',
  'learning',
  'knowledge',
  'agents',
  'conversations',
  'messages',
  'notifications',
  'polls',
  'email',
  'observability',
  'calendar',
  'documents',
] as const

test('the API entrypoint is a composition root, not a business router', async () => {
  const source = await readFile(new URL('../api/router.ts', import.meta.url), 'utf8')

  assert.ok(source.split('\n').length <= 300, 'api/router.ts must stay below 300 lines')
  assert.equal(source.match(/authMiddleware/g)?.length, 2, 'one import and one global middleware mount are expected')
  assert.doesNotMatch(source, /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/)
  assert.doesNotMatch(source, /\bpool\.query\b/)
  assert.match(source, /api\.use\(errorHandler\)/)

  for (const domain of domains) {
    assert.match(source, new RegExp(`import \\{ ${domain}Router \\} from '../modules/${domain}/router\\.js'`))
    assert.match(source, new RegExp(`api\\.use\\(${domain}Router\\)`))
  }
})

test('domain modules expose one native router implementation without forwarding services', async () => {
  let routeRegistrations = 0
  for (const domain of domains) {
    const router = await readFile(new URL(`../modules/${domain}/router.ts`, import.meta.url), 'utf8')
    assert.match(router, new RegExp(`export const ${domain}Router = Router\\(\\)`))
    assert.doesNotMatch(router, /ServiceRoutes|from ['"]\.\/service\.js['"]/)
    await assert.rejects(readFile(new URL(`../modules/${domain}/service.ts`, import.meta.url), 'utf8'), { code: 'ENOENT' })
    routeRegistrations += router.match(/(?:api|[a-z]+Router)\.(?:all|get|post|put|patch|delete)\('/g)?.length ?? 0
  }

  assert.ok(routeRegistrations > 100, 'domain route registrations unexpectedly disappeared')
})

test('migrated domains are complete vertical slices with thin HTTP routers', async () => {
  for (const domain of ['agents', 'calendar', 'canvas', 'companies', 'conversations', 'documents', 'email', 'identity', 'knowledge', 'learning', 'messages', 'notifications', 'observability', 'platform', 'polls']) {
    const base = new URL(`../modules/${domain}/`, import.meta.url)
    const router = await readFile(new URL('router.ts', base), 'utf8')
    const applicationFiles = (await readdir(new URL('.', base)))
      .filter((name) => name.endsWith('application.ts'))
    const application = (await Promise.all(
      applicationFiles.map((name) => readFile(new URL(name, base), 'utf8')),
    )).join('\n')
    const repositoryFiles = (await readdir(new URL('.', base)))
      .filter((name) => name.endsWith('-repository.ts'))
    const repository = repositoryFiles.length > 0
      ? (await Promise.all(repositoryFiles.map((name) => readFile(new URL(name, base), 'utf8')))).join('\n')
      : await readFile(new URL('repository.ts', base), 'utf8')
    const contracts = await readFile(new URL('contracts.ts', base), 'utf8')

    assert.doesNotMatch(router, /\bpool\.query\b|\bSELECT\s+|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/)
    assert.doesNotMatch(router, /from ['"][^'"]*db\//)
    assert.doesNotMatch(application, /from ['"]express['"]|\b(?:req|res)\s*[.:]/)
    assert.doesNotMatch(application, /from ['"][^'"]*db\/(?:pool|transaction)\.js['"]/)
    assert.doesNotMatch(application, /\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)
    assert.doesNotMatch(repository, /from ['"]express['"]|\b(?:Request|Response)\b/)
    assert.match(repository, /Queryable/)
    assert.match(contracts, /z\.object/)
  }
  await assert.rejects(readFile(new URL('../polls.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../canvas/service.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../api/admin-router.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../admin.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../oauth.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../documents/rooms.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../documents/markdown.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  const documentCollaboration = await readFile(new URL('../modules/documents/collaboration-application.ts', import.meta.url), 'utf8')
  const documentRepository = await readFile(new URL('../modules/documents/collaboration-repository.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(documentCollaboration, /from ['"][^'"]*(?:db\/pool|db\/transaction|redis|storage|env)\.js['"]/)
  assert.doesNotMatch(documentCollaboration, /\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)
  assert.match(documentRepository, /Queryable/)
  const documentConsumers = await Promise.all([
    '../agents/cli/document.ts',
    '../web.ts',
    '../ws.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.match(documentConsumers.join('\n'), /modules\/documents\/public\.js/)
  assert.doesNotMatch(documentConsumers.join('\n'), /modules\/documents\/(?:collaboration-|markdown)/)
  assert.doesNotMatch(documentConsumers[0], /db\/pool\.js|\bpool\.query\b|redis\.js/)
  assert.match(documentConsumers[0], /modules\/conversations\/public\.js/)
  const wsDocumentAuthorization = documentConsumers[2].slice(
    documentConsumers[2].indexOf('async function docCompanyFor'),
    documentConsumers[2].indexOf('function sendJson'),
  )
  assert.match(wsDocumentAuthorization, /permissionService\.can/)
  assert.match(wsDocumentAuthorization, /action: writable \? 'document:write' : 'document:read'/)
  assert.doesNotMatch(wsDocumentAuthorization, /\bpool\.query\b|`\s*SELECT\b/i)
  const wsDocumentMention = documentConsumers[2].slice(
    documentConsumers[2].indexOf("if (type === 'doc.mention.notify')"),
    documentConsumers[2].indexOf('export function attachWebSocket'),
  )
  assert.match(wsDocumentMention, /notifyDocumentMention/)
  assert.doesNotMatch(wsDocumentMention, /\bpool\.query\b|document_mentions|agent_log|im_channel_bindings/)
  await assert.rejects(readFile(new URL('../knowledge/service.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../knowledge/agent-knowledge.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../knowledge/open-notebook-client.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  const knowledgeProvider = await readFile(new URL('../modules/knowledge/provider.ts', import.meta.url), 'utf8')
  const knowledgeRuntime = await readFile(new URL('../modules/knowledge/runtime.ts', import.meta.url), 'utf8')
  const knowledgeIngestionRepository = await readFile(new URL('../modules/knowledge/ingestion-repository.ts', import.meta.url), 'utf8')
  const knowledgeAgentActions = await readFile(new URL('../modules/knowledge/agent-application.ts', import.meta.url), 'utf8')
  assert.match(knowledgeProvider, /\bfetch\s*\(/)
  assert.doesNotMatch(`${knowledgeRuntime}\n${knowledgeAgentActions}`, /\bfetch\s*\(/)
  assert.doesNotMatch(knowledgeRuntime, /\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)
  assert.match(knowledgeIngestionRepository, /Queryable/)
  assert.match(knowledgeIngestionRepository, /FOR UPDATE SKIP LOCKED/)
  await assert.rejects(readFile(new URL('../modules/admin/router.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  const pollCallers = await Promise.all([
    '../agent-os/learning-actions.ts',
    '../agents/cli.ts',
    '../worker.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(pollCallers.join('\n'), /from ['"][^'"]*modules\/polls\/(?:application|repository|facade|contracts)/)
  assert.doesNotMatch(pollCallers.join('\n'), /from ['"][^'"]*polls\.js/)
  const canvasCallers = await Promise.all([
    '../agent-os/learning-actions.ts',
    '../agent-os/control-plane.ts',
    '../__integration__/canvas.test.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(canvasCallers.join('\n'), /from ['"][^'"]*modules\/canvas\/(?:application|repository|contracts)/)
  assert.doesNotMatch(canvasCallers.join('\n'), /from ['"][^'"]*canvas\/service\.js/)
  const calendarCli = await readFile(new URL('../agents/cli/calendar.ts', import.meta.url), 'utf8')
  assert.match(calendarCli, /from ['"]\.\.\/\.\.\/modules\/calendar\/index\.js['"]/)
  assert.doesNotMatch(calendarCli, /modules\/calendar\/(?:application|contracts|facade|repository)\.js/)
  assert.doesNotMatch(calendarCli, /from ['"][^'"]*db\/pool\.js['"]|\bpool\.query\b/)
  assert.doesNotMatch(calendarCli, /`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/is)
  assert.doesNotMatch(calendarCli, /from ['"][^'"]*calendar\.js['"]|import\(['"][^'"]*calendar\.js['"]\)/)
  const emailCli = await readFile(new URL('../agents/cli/email.ts', import.meta.url), 'utf8')
  assert.match(emailCli, /from ['"]\.\.\/\.\.\/modules\/email\/index\.js['"]/)
  assert.doesNotMatch(emailCli, /from ['"][^'"]*db\/|\bpool\.query\b/)
  assert.doesNotMatch(emailCli, /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(emailCli, /modules\/email\/(?:agent-)?(?:application|contracts|facade|repository)\.js/)
  const conversationMetadataCli = await readFile(
    new URL('../agents/cli/conversation-metadata.ts', import.meta.url),
    'utf8',
  )
  assert.match(conversationMetadataCli, /modules\/conversations\/public\.js/)
  assert.doesNotMatch(conversationMetadataCli, /from ['"][^'"]*(?:db\/|redis\.js)|\bpool\.query\b/)
  assert.doesNotMatch(conversationMetadataCli, /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(
    conversationMetadataCli,
    /modules\/conversations\/(?:application|contracts|facade|repository)\.js/,
  )
  const conversationDeliveryCli = await readFile(
    new URL('../agents/cli/conversation-delivery.ts', import.meta.url),
    'utf8',
  )
  assert.match(conversationDeliveryCli, /modules\/conversations\/public\.js/)
  assert.doesNotMatch(conversationDeliveryCli, /from ['"][^'"]*(?:db\/|redis\.js)|\bpool\.query\b/)
  assert.doesNotMatch(conversationDeliveryCli, /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(
    conversationDeliveryCli,
    /modules\/conversations\/(?:application|contracts|facade|repository)\.js/,
  )
  const participantDirectoryCli = await readFile(
    new URL('../agents/cli/participant-directory.ts', import.meta.url),
    'utf8',
  )
  assert.match(participantDirectoryCli, /modules\/agents\/index\.js/)
  assert.doesNotMatch(participantDirectoryCli, /from ['"][^'"]*(?:db\/|redis\.js)|\bpool\.query\b/)
  assert.doesNotMatch(participantDirectoryCli, /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(
    participantDirectoryCli,
    /modules\/agents\/(?:application|contracts|facade|repository|directory-(?:application|repository))\.js/,
  )
  await assert.rejects(readFile(new URL('../calendar.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../email.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../email-retry.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../email-gc.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../api/inbound-email.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../invitation-email.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(new URL('../onboardCompany.ts', import.meta.url), 'utf8'), { code: 'ENOENT' })
  const contextThreadPublic = await readFile(new URL('../modules/context-threads/public.ts', import.meta.url), 'utf8')
  assert.match(contextThreadPublic, /seedMemberLearningContextThreads/)
  const emailCallers = await Promise.all([
    '../modules/companies/invitation-email.ts',
    '../modules/notifications/worker.ts',
    '../agents/cli.ts',
    '../agents/cli/email.ts',
    '../modules/agents/facade.ts',
    '../modules/messages/facade.ts',
    '../web.ts',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.doesNotMatch(
    emailCallers.join('\n'),
    /modules\/email\/(?:addressing|facade|provider|runtime|(?:[a-z-]+-)?(?:application|repository|router))\.js/
  )
  assert.match(emailCallers.join('\n'), /modules\/email\/index\.js/)
  const emailRuntime = await readFile(new URL('../modules/email/runtime.ts', import.meta.url), 'utf8')
  const emailProvider = await readFile(new URL('../modules/email/provider.ts', import.meta.url), 'utf8')
  const emailAddressing = await readFile(new URL('../modules/email/addressing.ts', import.meta.url), 'utf8')
  assert.ok(emailRuntime.split('\n').length < 500, 'Email runtime must remain bounded after capability extraction')
  assert.doesNotMatch(emailRuntime, /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)
  assert.doesNotMatch(emailProvider, /\b(?:pool|db)\.query\b|from ['"]express['"]/)
  assert.doesNotMatch(emailAddressing, /\b(?:pool|db)\.query\b|\bfetch\s*\(/)
  for (const repositoryName of [
    'agent-repository.ts',
    'address-repository.ts',
    'attachment-repository.ts',
    'conversation-repository.ts',
    'inbound-repository.ts',
    'message-repository.ts',
    'retry-repository.ts',
  ]) {
    const emailRepository = await readFile(new URL(`../modules/email/${repositoryName}`, import.meta.url), 'utf8')
    assert.match(emailRepository, /Queryable/)
    assert.doesNotMatch(emailRepository, /from ['"]express['"]|\bfetch\s*\(/)
  }
  const inboundApplication = await readFile(new URL('../modules/email/inbound-application.ts', import.meta.url), 'utf8')
  const retryApplication = await readFile(new URL('../modules/email/retry-application.ts', import.meta.url), 'utf8')
  const gcApplication = await readFile(new URL('../modules/email/gc-application.ts', import.meta.url), 'utf8')
  const inboundRouter = await readFile(new URL('../modules/email/resend-inbound-router.ts', import.meta.url), 'utf8')
  const inboundInfrastructure = await readFile(new URL('../modules/email/resend-inbound-infrastructure.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(inboundApplication, /from ['"][^'"]*db\/pool\.js['"]|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(retryApplication, /from ['"][^'"]*db\/|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(gcApplication, /from ['"][^'"]*db\/|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(inboundRouter, /from ['"][^'"]*db\/|\b(?:pool|db)\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.match(inboundInfrastructure, /\bfetch/)
  assert.doesNotMatch(inboundInfrastructure, /from ['"]express['"]|\b(?:pool|db)\.query\b/)
  const workerComposition = await readFile(new URL('../worker.ts', import.meta.url), 'utf8')
  assert.match(workerComposition, /from ['"]\.\/modules\/email\/worker\.js['"]/)
  const webComposition = await readFile(new URL('../web.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(webComposition, /modules\/email\/worker\.js/)
  const calendarScheduler = await readFile(new URL('../modules/calendar/scheduler.ts', import.meta.url), 'utf8')
  const calendarWorker = await readFile(new URL('../worker.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(calendarScheduler, /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.match(calendarWorker, /from ['"]\.\/modules\/calendar\/index\.js['"]/)

  const auth = await readFile(new URL('../auth.ts', import.meta.url), 'utf8')
  assert.match(auth, /from ['"]\.\/modules\/identity\/public\.js['"]/)
  assert.doesNotMatch(auth, /from ['"][^'"]*db\/|\b(?:pool|db)\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.doesNotMatch(auth, /export (?:async )?function (?:audit|createSession|createWsTicket|consumeWsTicket)\b/)
  const oidcInfrastructure = await readFile(new URL('../modules/identity/oidc-infrastructure.ts', import.meta.url), 'utf8')
  const oauthApplication = await readFile(new URL('../modules/identity/oauth-application.ts', import.meta.url), 'utf8')
  const oauthRepository = await readFile(new URL('../modules/identity/oauth-repository.ts', import.meta.url), 'utf8')
  assert.match(oidcInfrastructure, /\bfetch\s*\(/)
  assert.doesNotMatch(oauthApplication, /\bfetch\s*\(|from ['"][^'"]*db\/(?:pool|transaction)\.js['"]|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is)
  assert.match(oauthRepository, /Queryable/)
  assert.doesNotMatch(oauthRepository, /from ['"]express['"]|\bfetch\s*\(/)
})

test('retired observability HTTP views cannot return', async () => {
  const router = await readFile(new URL('../modules/observability/router.ts', import.meta.url), 'utf8')
  const application = await readFile(new URL('../modules/observability/application.ts', import.meta.url), 'utf8')
  const repository = await readFile(new URL('../modules/observability/repository.ts', import.meta.url), 'utf8')
  const contracts = await readFile(new URL('../modules/observability/contracts.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(router, /\/agents\/observability\/runs/)
  assert.doesNotMatch(application, /\bruns\(|\brunEvents\(/)
  assert.doesNotMatch(repository, /\blistRuns\b|\blistRunEvents\b|\brunExists\b/)
  assert.doesNotMatch(contracts, /runQuerySchema/)
})

test('retired boards capability has no HTTP or Agent entry point', async () => {
  const router = await readFile(new URL('../api/router.ts', import.meta.url), 'utf8')
  const cli = await readFile(new URL('../agents/cli.ts', import.meta.url), 'utf8')
  await assert.rejects(readFile(new URL('../modules/boards/router.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(router, /boardsRouter|modules\/boards/)
  assert.doesNotMatch(cli, /createBoardCommands|cmdBoard|cmdCard|case 'kanban'/)
})

test('authentication, request context, authorization, and errors have one shared boundary', async () => {
  const context = await readFile(new URL('../http/request-context.ts', import.meta.url), 'utf8')
  const authorization = await readFile(new URL('../http/authorization.ts', import.meta.url), 'utf8')
  const asyncHandler = await readFile(new URL('../http/async-handler.ts', import.meta.url), 'utf8')
  const errors = await readFile(new URL('../http/errors.ts', import.meta.url), 'utf8')
  const routers = await Promise.all(domains.map((domain) => (
    readFile(new URL(`../modules/${domain}/router.ts`, import.meta.url), 'utf8')
  )))
  for (const boundary of ['requireAuth', 'requireCompany', 'requireWorkspace']) {
    assert.match(context, new RegExp(`export (?:async )?function ${boundary}\\b`))
  }
  for (const boundary of ['requireConversationMember', 'requireCanvasWorkspace']) {
    assert.match(authorization, new RegExp(`export async function ${boundary}\\b`))
  }
  assert.match(asyncHandler, /export function safe\b/)
  assert.doesNotMatch(asyncHandler, /res\.status|console\.error|instanceof HttpError/)
  assert.match(errors, /export class HttpError\b/)
  assert.match(errors, /export function errorHandler\b/)
  assert.match(errors, /err instanceof ZodError/)
  for (const router of routers) {
    assert.doesNotMatch(router, /import \{[^}]*\bauthMiddleware\b[^}]*\} from ['"]\.\.\/\.\.\/auth\.js['"]/s)
    assert.doesNotMatch(router, /\.use\(authMiddleware/)
    assert.doesNotMatch(router, /function safe\b|console\.error\(['"]\[admin-api\]/)
  }
})

test('signup configuration surfaces cannot return', async () => {
  const platform = await readFile(new URL('../modules/platform/router.ts', import.meta.url), 'utf8')
  const identity = await readFile(new URL('../modules/identity/contracts.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(platform, /signup-config|waitlist/)
  assert.doesNotMatch(identity, /isAdmin/)
})
