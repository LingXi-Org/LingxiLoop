import { readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

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
const frontendNames = new Set(frontend.map(name))

for (const retired of ['src/features/admin', 'src/features/eval']) {
  if ([...frontendNames].some((fileName) => fileName.startsWith(`${retired}/`))) {
    violations.push(`${retired}: retired Admin/Eval frontend must not return; backend contracts remain authoritative`)
  }
}

const canonicalConversationFiles = new Set([
  'src/components/AttachmentViewer.tsx',
  'src/components/Avatar.tsx',
  'src/components/ImageViewer.tsx',
  'src/components/RichInput.tsx',
  'src/components/ScrollToLatestButton.tsx',
  'src/desktop/ChatPane.tsx',
  'src/desktop/ThreadDrawer.tsx',
  'src/im/Composer.tsx',
  'src/im/ConversationHeader.tsx',
  'src/im/ConversationList.tsx',
  'src/im/MessageList.tsx',
  'src/features/chat/components/ChatComposer.tsx',
  'src/features/chat/components/ComposerMenus.tsx',
  'src/features/chat/components/ComposerEmojiPopover.tsx',
])
const retiredConversationTokens = /\b(?:text|bg|border|ring|from|via|to)-(?:sand|ink|skype|coral|sky2)-|\b(?:bg-panel|bg-raised|border-hairline|bg-paper|bg-cloud)\b|--(?:sand|ink|coral|sky2|skype-deep)\b/
for (const file of frontend) {
  const fileName = name(file)
  const isConversationSlice = canonicalConversationFiles.has(fileName)
    || fileName.startsWith('src/features/chat/')
    || fileName.startsWith('src/components/messages/')
  if (!isConversationSlice) continue
  const source = await read(file)
  if (/<button\b|<select\b|<textarea\b|role=['"](?:dialog|switch)['"]/.test(source)) {
    violations.push(`${fileName}: main conversation UI must compose canonical shadcn primitives`)
  }
  if (retiredConversationTokens.test(source)) {
    violations.push(`${fileName}: main conversation UI must use canonical semantic Luma tokens`)
  }
}

const productionFrontend = (await Promise.all(frontend.map(read))).join('\n')
const frontendTheme = await readFile(resolve('src/styles/globals.css'), 'utf8')
const shadcnConfig = JSON.parse(await readFile(resolve('components.json'), 'utf8'))
if (shadcnConfig.style !== 'radix-luma' || shadcnConfig.tailwind?.baseColor !== 'mist' || shadcnConfig.iconLibrary !== 'hugeicons') {
  violations.push('components.json: canonical shadcn preset b3bZWXGcRE (radix-luma/mist/hugeicons) is required')
}
if (/@base-ui\/react/.test(productionFrontend)) violations.push('frontend: Base UI is forbidden; use the canonical shadcn primitives')
if (/agent-avatar/.test(`${productionFrontend}\n${frontendTheme}`)) {
  violations.push('frontend: retired Agent avatar styling is forbidden; animate the Bloub surface directly')
}
const canonicalThemeOverride = /--(?:background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|border|input|ring|sidebar)(?:-foreground|-border|-ring)?:/
for (const scope of ['assistant-ui-scope', 'desktop-openmaus']) {
  const block = frontendTheme.match(new RegExp(`\\.${scope}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
  if (canonicalThemeOverride.test(block)) {
    violations.push(`src/styles/globals.css: .${scope} must inherit canonical Luma tokens`)
  }
}
if (!/--app:\s*var\(--background\)/.test(frontendTheme) || !/--panel:\s*var\(--card\)/.test(frontendTheme)) {
  violations.push('src/styles/globals.css: product surface aliases must derive from canonical Luma tokens')
}
for (const [label, pattern] of [
  ['production mock identity', /mock-(?:user|source)|startsWith\(['"]mock-/],
  ['native browser dialog', /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/],
  ['Base64 upload data plane', /dataBase64|\/uploads['"]\s*,/],
  ['retired device dev mode', /x-lingxiloop-dev-mode|lingxiloop\.devtools\.enabled/],
  ['retired device server override', /lingxiloop\.serverUrl|setServerOrigin\s*\(/],
  ['retired root API facade', /\b(?:platformApi|filesApi|observabilityApi)\b/],
  ['retired agent portrait path', /agents?\/[^'"`]*avatar\/generate|generateAgentAvatar|AI生成的肖像|AI portrait/],
  ['retired agent notification signature', /authorAvatarBg/],
  ['retired participant avatar event', /participants\.avatar/],
]) if (pattern.test(productionFrontend)) violations.push(`frontend: ${label} is forbidden`)

const fetchAllowlist = new Set([
  'src/api/transport.ts',
  'src/components/AttachmentViewer.tsx', 'src/features/canvas/components/CanvasView.tsx',
  'src/components/ImageViewer.tsx', 'src/lib/avatarCache.ts',
])
for (const file of frontend) {
  const source = await read(file)
  const fileName = name(file)
  if (new Set(['src/api/files.ts', 'src/api/observability.ts', 'src/api/platform.ts']).has(fileName)) violations.push(`${fileName}: retired root API facade is forbidden`)
  if (/\bfetch\s*\(/.test(source) && !fetchAllowlist.has(fileName)) violations.push(`${fileName}: raw fetch bypasses the shared transport`)
  if (/\bnew\s+WebSocket\s*\(/.test(source) && fileName !== 'src/api/core/realtime.ts') violations.push(`${fileName}: WebSocket construction bypasses realtime.ts`)
}

const rootRouter = await read(resolve('server/src/api/router.ts'))
if (/\b(?:pool|sql|query)\b|\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(rootRouter)) violations.push('server/src/api/router.ts: composition root contains persistence or business logic')
if (/^export\s+\{.+\}\s+from/m.test(rootRouter)) violations.push('server/src/api/router.ts: composition root must not export domain capabilities')

const boardCli = await read(resolve('server/src/agents/cli/board.ts'))
if (/from ['"][^'"]*db\/|\bpool\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is.test(boardCli)) {
  violations.push('server/src/agents/cli/board.ts: Agent Board actions bypass modules/boards/public.ts')
}
if (/from ['"][^'"]*redis\.js['"]|enqueueAgentWork|modules\/boards\/(?:application|contracts|facade|repository)\.js/.test(boardCli)) {
  violations.push('server/src/agents/cli/board.ts: Agent Board actions bypass the public domain facade')
}
const emailCli = await read(resolve('server/src/agents/cli/email.ts'))
if (/from ['"][^'"]*db\/|\bpool\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is.test(emailCli)) {
  violations.push('server/src/agents/cli/email.ts: Agent Email actions bypass modules/email/index.ts')
}
if (/modules\/email\/(?:agent-)?(?:application|contracts|facade|repository)\.js/.test(emailCli)) {
  violations.push('server/src/agents/cli/email.ts: Agent Email actions bypass the public domain facade')
}
const conversationMetadataCli = await read(resolve('server/src/agents/cli/conversation-metadata.ts'))
if (/from ['"][^'"]*(?:db\/|redis\.js)|\bpool\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is.test(conversationMetadataCli)) {
  violations.push('server/src/agents/cli/conversation-metadata.ts: conversation metadata bypasses its domain')
}
if (/modules\/conversations\/(?:application|contracts|facade|repository)\.js/.test(conversationMetadataCli)) {
  violations.push('server/src/agents/cli/conversation-metadata.ts: conversation metadata bypasses public.ts')
}
const conversationDeliveryCli = await read(resolve('server/src/agents/cli/conversation-delivery.ts'))
if (/from ['"][^'"]*(?:db\/|redis\.js)|\bpool\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is.test(conversationDeliveryCli)) {
  violations.push('server/src/agents/cli/conversation-delivery.ts: conversation delivery bypasses its domain')
}
if (/modules\/conversations\/(?:application|contracts|facade|repository)\.js/.test(conversationDeliveryCli)) {
  violations.push('server/src/agents/cli/conversation-delivery.ts: conversation delivery bypasses public.ts')
}
const participantDirectoryCli = await read(resolve('server/src/agents/cli/participant-directory.ts'))
if (/from ['"][^'"]*(?:db\/|redis\.js)|\bpool\.query\b|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/is.test(participantDirectoryCli)) {
  violations.push('server/src/agents/cli/participant-directory.ts: participant directory bypasses Agents domain')
}
if (/modules\/agents\/(?:application|contracts|facade|repository|directory-(?:application|repository))\.js/.test(participantDirectoryCli)) {
  violations.push('server/src/agents/cli/participant-directory.ts: participant directory bypasses index.ts')
}

const observabilityRouter = await read(resolve('server/src/modules/observability/router.ts'))
if (/\/agents\/observability\/runs/.test(observabilityRouter)) violations.push('server/src/modules/observability/router.ts: retired observability HTTP view is forbidden')

const evalService = await read(resolve('server/src/eval/service.ts'))
if (/from ['"][^'"]*db\//.test(evalService) || /\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(evalService)) {
  violations.push('server/src/eval/service.ts: Eval application logic bypasses repository.ts')
}

// Domains enter this set only after their router/application/repository split
// is complete. Keeping the assertion here makes a later regression impossible
// while the remaining domains are migrated deliberately.
const strictServerDomains = new Set(['admin', 'agents', 'boards', 'calendar', 'canvas', 'companies', 'conversations', 'documents', 'email', 'identity', 'knowledge', 'learning', 'messages', 'observability', 'platform', 'polls'])

for (const file of server) {
  const source = await read(file)
  const fileName = name(file)
  if (fileName === 'server/src/admin.ts') violations.push(`${fileName}: retired root admin implementation is forbidden`)
  if (fileName === 'server/src/alert.ts') violations.push(`${fileName}: operational alerts must use alerting.ts`)
  if (fileName === 'server/src/email.ts') violations.push(`${fileName}: retired root email implementation is forbidden`)
  if (fileName === 'server/src/invitation-email.ts') violations.push(`${fileName}: Companies email capability must remain inside its vertical slice`)
  if (fileName === 'server/src/email-retry.ts' || fileName === 'server/src/email-gc.ts' || fileName === 'server/src/api/inbound-email.ts') {
    violations.push(`${fileName}: retired root Email capability is forbidden`)
  }
  if (fileName === 'server/src/oauth.ts') violations.push(`${fileName}: retired root OAuth implementation is forbidden`)
  if (fileName === 'server/src/oidc.ts') violations.push(`${fileName}: LingxiIdentity HTTP must remain inside its infrastructure entrypoint`)
  if (fileName === 'server/src/onboardCompany.ts') {
    violations.push(`${fileName}: company onboarding must remain inside modules/companies`)
  }
  if (fileName === 'server/src/documents/rooms.ts' || fileName === 'server/src/documents/markdown.ts') {
    violations.push(`${fileName}: retired root Documents capability is forbidden`)
  }
  if (!fileName.startsWith('server/src/modules/documents/')
    && /modules\/documents\/(?:(?:collaboration|mention)-(?:application|facade|repository)|markdown)\.js/.test(source)) {
    violations.push(`${fileName}: Documents access must use modules/documents/public.ts`)
  }
  if (fileName === 'server/src/knowledge/service.ts') violations.push(`${fileName}: retired root Knowledge implementation is forbidden`)
  if (fileName === 'server/src/knowledge/agent-knowledge.ts' || fileName === 'server/src/knowledge/open-notebook-client.ts') {
    violations.push(`${fileName}: retired root Knowledge capability is forbidden`)
  }
  if (/knowledge\/service\.js/.test(source)) violations.push(`${fileName}: Knowledge access must use modules/knowledge public or worker surface`)
  if (!fileName.startsWith('server/src/modules/knowledge/')
    && /modules\/knowledge\/(?:agent-application|provider|runtime)\.js/.test(source)) {
    violations.push(`${fileName}: Knowledge internals must be accessed through public.ts or worker.ts`)
  }
  const importsEmailRouterAtCompositionRoot = fileName === 'server/src/api/router.ts'
    && /modules\/email\/router\.js/.test(source)
  if (!fileName.startsWith('server/src/modules/email/')
    && /modules\/email\/(?:addressing|facade|provider|runtime|(?:[a-z-]+-)?(?:application|repository|router))\.js/.test(source)
    && !importsEmailRouterAtCompositionRoot) {
    violations.push(`${fileName}: Email access must use modules/email/index.ts`)
  }
  if (/\bnew\s+OpenAI\s*\(/.test(source) && fileName !== 'server/src/llm-client.ts') violations.push(`${fileName}: OpenAI construction bypasses llm-client.ts`)
  if (/\bnew\s+S3Client\s*\(/.test(source) && fileName !== 'server/src/storage.ts') violations.push(`${fileName}: object storage construction bypasses storage.ts`)
  if (/x-lingxiloop-dev-mode|EMAIL_MOCK_FAIL_RATE|SUB2API|DEEPSEEK_API_KEY|DISCORD_ALERT_WEBHOOK_URL/.test(source)) violations.push(`${fileName}: retired production switch is forbidden`)
  if (/agent-gender|agent-avatar|generateAndPersistAvatar|visualSignatureFor|cmdAvatar\b|\/avatar\/generate/.test(source)) violations.push(`${fileName}: agent portraits are retired; agents use Bloub`)
  if (/participants\.avatar/.test(source)) violations.push(`${fileName}: retired participant avatar event is forbidden`)
  if (/\/devtools\//.test(source) || /api\.post\(['"]\/uploads['"]/.test(source) || /sources\/upload['"]/.test(source)) violations.push(`${fileName}: retired endpoint is forbidden`)
  const domainRouter = fileName.match(/^server\/src\/modules\/([^/]+)\/(?:[a-z-]+-)?router\.ts$/)?.[1]
  if (domainRouter && strictServerDomains.has(domainRouter)) {
    if (/from ['"][^'"]*db\//.test(source) || /\b(?:pool|db)\.query\b/.test(source)) violations.push(`${fileName}: router bypasses its repository`)
    if (/`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`/is.test(source)) violations.push(`${fileName}: router contains SQL`)
    if (domainRouter === 'admin' && /from ['"]\.\.\/\.\.\/eval\/(?:contracts|service|repository)\.js['"]/.test(source)) {
      violations.push(`${fileName}: cross-domain Eval access must use eval/public.ts`)
    }
  }
  if (/(?:^|\/)(?:repository|[^/]+-repository)\.ts$/.test(fileName) && /from ['"]express['"]|\b(?:Request|Response)\b/.test(source)) {
    violations.push(`${fileName}: repository depends on HTTP`)
  }
  if (/(?:^|\/)(?:application|[^/]+-application)\.ts$/.test(fileName) && /from ['"]express['"]|\b(?:req|res)\s*[.:]/.test(source)) {
    violations.push(`${fileName}: application depends on HTTP objects`)
  }
  const owningDomain = fileName.match(/^server\/src\/modules\/([^/]+)\//)?.[1]
  if (owningDomain === 'identity' && /\bfetch\s*\(/.test(source)
    && !new Set([
      'server/src/modules/identity/oidc-infrastructure.ts',
      'server/src/modules/identity/oidc-protocol.ts',
    ]).has(fileName)) {
    violations.push(`${fileName}: LingxiIdentity HTTP bypasses oidc-infrastructure.ts`)
  }
  if (owningDomain === 'knowledge' && /\bfetch\s*\(/.test(source)
    && fileName !== 'server/src/modules/knowledge/provider.ts') {
    violations.push(`${fileName}: Open Notebook HTTP bypasses the Knowledge provider`)
  }
  if (owningDomain) {
    for (const match of source.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1]
      if (!specifier.startsWith('.')) continue
      const target = relative(process.cwd(), resolve(dirname(file), specifier.replace(/\.js$/, '.ts'))).replaceAll('\\', '/')
      const targetMatch = target.match(/^server\/src\/modules\/([^/]+)\/([^/]+)\.ts$/)
      if (!targetMatch || targetMatch[1] === owningDomain) continue
      if (!new Set(['index', 'facade', 'contracts', 'public']).has(targetMatch[2])) {
        violations.push(`${fileName}: cross-domain import bypasses ${targetMatch[1]}'s public surface (${target})`)
      }
    }
  }
  const domainApplication = fileName.match(
    /^server\/src\/modules\/([^/]+)\/(?:application|[^/]+-application)\.ts$/,
  )?.[1]
  if (domainApplication && strictServerDomains.has(domainApplication)) {
    if (/from ['"][^'"]*db\/(?:pool|transaction)\.js['"]/.test(source)) {
      violations.push(`${fileName}: application imports concrete database infrastructure`)
    }
    if (/\b(?:pool|client|db)\.query\s*\(/.test(source) || /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(source)) {
      violations.push(`${fileName}: application bypasses its repository`)
    }
  }
}

const authSource = await read(resolve('server/src/auth.ts'))
if (/from ['"][^'"]*db\//.test(authSource) || /`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(authSource)) {
  violations.push('server/src/auth.ts: global authentication middleware must not own persistence')
}
if (!/modules\/identity\/public\.js/.test(authSource)) {
  violations.push('server/src/auth.ts: session resolution must use the Identity public surface')
}

if (violations.length > 0) {
  console.error(`Architecture guard failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exit(1)
}
console.log(`Architecture guard passed (${frontend.length} frontend and ${server.length} server production files scanned).`)
