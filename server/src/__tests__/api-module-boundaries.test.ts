import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  'polls',
  'email',
  'observability',
  'boards',
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
  for (const domain of ['boards', 'calendar', 'companies', 'conversations', 'documents', 'email', 'identity', 'knowledge', 'learning', 'messages', 'observability', 'platform']) {
    const base = new URL(`../modules/${domain}/`, import.meta.url)
    const router = await readFile(new URL('router.ts', base), 'utf8')
    const application = await readFile(new URL('application.ts', base), 'utf8')
    const repository = await readFile(new URL('repository.ts', base), 'utf8')
    const contracts = await readFile(new URL('contracts.ts', base), 'utf8')

    assert.doesNotMatch(router, /\bpool\.query\b|\b(?:SELECT|INSERT|UPDATE|DELETE)\b/)
    assert.doesNotMatch(router, /from ['"][^'"]*db\//)
    assert.doesNotMatch(application, /from ['"]express['"]|\b(?:req|res)\s*[.:]/)
    assert.doesNotMatch(repository, /from ['"]express['"]|\b(?:Request|Response)\b/)
    assert.match(repository, /Queryable/)
    assert.match(contracts, /z\.object/)
  }
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
  for (const boundary of ['requireCompanyRole', 'requireConversationMember', 'requireCanvasWorkspace']) {
    assert.match(authorization, new RegExp(`export async function ${boundary}\\b`))
  }
  assert.match(asyncHandler, /export function safe\b/)
  assert.match(errors, /export class HttpError\b/)
  assert.match(errors, /export function errorHandler\b/)
  for (const router of routers) {
    assert.doesNotMatch(router, /import \{[^}]*\bauthMiddleware\b[^}]*\} from ['"]\.\.\/\.\.\/auth\.js['"]/s)
    assert.doesNotMatch(router, /\.use\(authMiddleware/)
  }
})
