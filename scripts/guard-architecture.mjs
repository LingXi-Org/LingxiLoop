import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

async function filesUnder(root) {
  const output = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) output.push(path)
    }
  }
  await walk(resolve(root))
  return output
}

const violations = []
const frontend = await filesUnder('src')
const server = await filesUnder('server/src')
const read = async (file) => readFile(file, 'utf8')
const name = (file) => relative(process.cwd(), file).replaceAll('\\', '/')

const productionFrontend = (await Promise.all(frontend.map(read))).join('\n')
for (const [label, pattern] of [
  ['production mock identity', /mock-(?:user|source)|startsWith\(['"]mock-/],
  ['native browser dialog', /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/],
  ['Base64 upload data plane', /dataBase64|\/uploads['"]\s*,/],
  ['retired device dev mode', /x-lingxiloop-dev-mode|lingxiloop\.devtools\.enabled/],
]) if (pattern.test(productionFrontend)) violations.push(`frontend: ${label} is forbidden`)

const fetchAllowlist = new Set([
  'src/api/transport.ts',
  'src/components/AttachmentViewer.tsx', 'src/components/CanvasView.tsx',
  'src/components/ImageViewer.tsx', 'src/lib/avatarCache.ts',
])
for (const file of frontend) {
  const source = await read(file)
  if (/\bfetch\s*\(/.test(source) && !fetchAllowlist.has(name(file))) violations.push(`${name(file)}: raw fetch bypasses the shared transport`)
  if (/\bnew\s+WebSocket\s*\(/.test(source) && name(file) !== 'src/api/core/realtime.ts') violations.push(`${name(file)}: WebSocket construction bypasses realtime.ts`)
}

const rootRouter = await read(resolve('server/src/api/router.ts'))
if (/\b(?:pool|sql|query)\b|\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(rootRouter)) violations.push('server/src/api/router.ts: composition root contains persistence or business logic')
if (/^export\s+\{.+\}\s+from/m.test(rootRouter)) violations.push('server/src/api/router.ts: composition root must not export domain capabilities')

// Domains enter this set only after their router/application/repository split
// is complete. Keeping the assertion here makes a later regression impossible
// while the remaining domains are migrated deliberately.
const strictServerDomains = new Set(['calendar', 'documents', 'messages', 'observability', 'platform'])

for (const file of server) {
  const source = await read(file)
  const fileName = name(file)
  if (/\bnew\s+OpenAI\s*\(/.test(source) && fileName !== 'server/src/llm-client.ts') violations.push(`${fileName}: OpenAI construction bypasses llm-client.ts`)
  if (/\bnew\s+S3Client\s*\(/.test(source) && fileName !== 'server/src/storage.ts') violations.push(`${fileName}: object storage construction bypasses storage.ts`)
  if (/x-lingxiloop-dev-mode|EMAIL_MOCK_FAIL_RATE|SUB2API|DEEPSEEK_API_KEY/.test(source)) violations.push(`${fileName}: retired production switch is forbidden`)
  if (/\/devtools\//.test(source) || /api\.post\(['"]\/uploads['"]/.test(source) || /sources\/upload['"]/.test(source)) violations.push(`${fileName}: retired endpoint is forbidden`)
  const domainRouter = fileName.match(/^server\/src\/modules\/([^/]+)\/router\.ts$/)?.[1]
  if (domainRouter && strictServerDomains.has(domainRouter)) {
    if (/from ['"][^'"]*db\//.test(source) || /\b(?:pool|db)\.query\b/.test(source)) violations.push(`${fileName}: router bypasses its repository`)
    if (/`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`/is.test(source)) violations.push(`${fileName}: router contains SQL`)
  }
  if (fileName.endsWith('/repository.ts') && /from ['"]express['"]|\b(?:Request|Response)\b/.test(source)) violations.push(`${fileName}: repository depends on HTTP`)
  if (fileName.endsWith('/application.ts') && /from ['"]express['"]|\b(?:req|res)\s*[.:]/.test(source)) violations.push(`${fileName}: application depends on HTTP objects`)
}

if (violations.length > 0) {
  console.error(`Architecture guard failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}
console.log(`Architecture guard passed (${frontend.length} frontend and ${server.length} server production files scanned).`)
