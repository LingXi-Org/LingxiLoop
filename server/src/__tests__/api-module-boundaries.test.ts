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
  'push',
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

test('domain routers stay thin and delegate to domain services', async () => {
  let routeRegistrations = 0
  for (const domain of domains) {
    const router = await readFile(new URL(`../modules/${domain}/router.ts`, import.meta.url), 'utf8')
    const service = await readFile(new URL(`../modules/${domain}/service.ts`, import.meta.url), 'utf8')

    assert.ok(router.split('\n').length <= 20, `${domain}/router.ts must remain a mount-only adapter`)
    assert.doesNotMatch(router, /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/)
    assert.doesNotMatch(router, /\bpool\b/)
    assert.match(router, new RegExp(`${domain}Router\\.use\\(${domain}ServiceRoutes\\)`))
    assert.match(service, new RegExp(`export const ${domain}ServiceRoutes = Router\\(\\)`))
    routeRegistrations += service.match(/api\.(?:all|get|post|put|patch|delete)\('/g)?.length ?? 0
  }

  assert.equal(routeRegistrations, 163, 'the public route contract changed unexpectedly')
})

test('authentication, request context, authorization, and errors have one shared boundary', async () => {
  const context = await readFile(new URL('../http/request-context.ts', import.meta.url), 'utf8')
  const authorization = await readFile(new URL('../http/authorization.ts', import.meta.url), 'utf8')
  const asyncHandler = await readFile(new URL('../http/async-handler.ts', import.meta.url), 'utf8')
  const errors = await readFile(new URL('../http/errors.ts', import.meta.url), 'utf8')
  const services = await Promise.all(domains.map((domain) => (
    readFile(new URL(`../modules/${domain}/service.ts`, import.meta.url), 'utf8')
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
  for (const service of services) {
    assert.doesNotMatch(service, /import \{[^}]*\bauthMiddleware\b[^}]*\} from ['"]\.\.\/\.\.\/auth\.js['"]/s)
    assert.doesNotMatch(service, /\.use\(authMiddleware/)
  }
})
