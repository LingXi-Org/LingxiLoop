import { access, readdir, readFile } from 'node:fs/promises'
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
const serverNames = new Set(server.map(name))
const electronMain = await read(resolve('electron/main.cjs'))
const electronUpdater = await read(resolve('electron/autoUpdater.cjs'))
if (/remote-debugging-port|registerDevShortcuts|DEV_SAMPLES|globalShortcut/.test(electronMain)) {
  violations.push('electron/main.cjs: device-level DevTools and synthetic notification paths are forbidden')
}
if (/fallback feed|generic publish provider[\s\S]*GitHub Release/.test(electronUpdater)) {
  violations.push('electron/autoUpdater.cjs: auto-update must document and use one publish provider')
}

const canonicalPermission = 'server/src/domain/access/permission.ts'
for (const file of server) {
  const fileName = name(file)
  const source = await read(file)
  if (fileName !== canonicalPermission
    && /export\s+(?:type\s+PermissionAction|interface\s+Permission(?:Context|Decision|Service))\b/.test(source)) {
    violations.push(`${fileName}: Permission contracts must be defined only in ${canonicalPermission}`)
  }
}
const canonicalUser = await read(resolve('server/src/domain/identity/user.ts'))
if (/\b(?:role|plan|isTeacher|isPro|isPaid|accountType|enterprise)\b/i.test(canonicalUser)) {
  violations.push('server/src/domain/identity/user.ts: User cannot carry product role, plan, or account-type state')
}
const canonicalSchema = await readFile(resolve('server/src/db/schema.sql'), 'utf8')
const usersTable = canonicalSchema.match(/CREATE TABLE public\.users \(([\s\S]*?)\n\);/)?.[1] ?? ''
if (/\b(?:is_admin|role|plan|is_teacher|is_pro|is_paid|account_type)\b/i.test(usersTable)) {
  violations.push('server/src/db/schema.sql: users must remain identity and lifecycle only')
}
if (/CREATE TABLE public\.permissions\b/.test(canonicalSchema)) {
  violations.push('server/src/db/schema.sql: Permission is a computed result and cannot be persisted as a table')
}

const projectTable = canonicalSchema.match(/CREATE TABLE public\.projects \(([\s\S]*?)\n\);/)?.[1] ?? ''
if (!/\bkind text NOT NULL\b/.test(projectTable)
  || !/projects_kind_check[\s\S]*PERSONAL_LEARNING[\s\S]*TEACHING[\s\S]*INSTITUTIONAL_COURSE/.test(projectTable)) {
  violations.push('server/src/db/schema.sql: every Project must have one canonical ProjectKind')
}
if (!/\bstatus text DEFAULT 'ACTIVE'::text NOT NULL\b/.test(projectTable)
  || !/projects_status_check[\s\S]*CREATED[\s\S]*DRAFT[\s\S]*ACTIVE[\s\S]*COURSE_ENDED[\s\S]*READ_ONLY[\s\S]*TRANSFER_PENDING[\s\S]*RETENTION[\s\S]*ARCHIVED[\s\S]*DELETED/.test(projectTable)) {
  violations.push('server/src/db/schema.sql: Project lifecycle must use the canonical uppercase status contract')
}
const companyTable = canonicalSchema.match(/CREATE TABLE public\.companies \(([\s\S]*?)\n\);/)?.[1] ?? ''
if (!/companies_status_check[\s\S]*TRIAL[\s\S]*USER_DELETION_PENDING[\s\S]*GRACE_PERIOD[\s\S]*OFFBOARDED[\s\S]*RETENTION[\s\S]*ARCHIVED[\s\S]*DELETED/.test(companyTable)
  || /companies_status_check[^\n]*SUSPENDED/.test(companyTable)) {
  violations.push('server/src/db/schema.sql: Company lifecycle must use typed Personal/Education states without SUSPENDED')
}
if (/\bis_general\b/.test(canonicalSchema) || !/\bis_default boolean DEFAULT false NOT NULL\b/.test(projectTable)) {
  violations.push('server/src/db/schema.sql: is_default is the only default-Project marker')
}

const controlledProjectWriters = new Set([
  'server/src/modules/companies/personal-workspace.ts',
  'server/src/modules/knowledge/repository.ts',
  'server/src/modules/learning/courses-repository.ts',
])
const projectLifecycleWriter = 'server/src/modules/projects/repository.ts'
const projectTransferWriter = 'server/src/modules/transfers/repository.ts'
const companyLifecycleWriter = 'server/src/modules/companies/lifecycle-repository.ts'
for (const file of [...server, ...frontend]) {
  const fileName = name(file)
  const source = await read(file)
  if (fileName.includes('/__integration__/')) continue
  if (fileName !== 'server/src/db/bootstrap.ts' && /\b(?:is_general|isGeneral)\b/.test(source)) {
    violations.push(`${fileName}: retired general-Project semantics are forbidden; use is_default only for default selection`)
  }
  if (/\binferProjectKind\b|\bproject\.kind\s*\?\?|\bprojectKind\s*\?\?/.test(source)) {
    violations.push(`${fileName}: ProjectKind must come directly from project.kind without inference or fallback`)
  }
  if (/(?:isDefault|is_default|courseId|course_id|companyName|company\.name|\brole)\b\s*(?:===?|\?|&&|\|\|)[^\n]{0,100}\b(?:PERSONAL_LEARNING|TEACHING|INSTITUTIONAL_COURSE)\b/.test(source)) {
    violations.push(`${fileName}: default, Course, Company name, and role context cannot infer ProjectKind`)
  }
  if (/\bis_default\s*=\s*TRUE\s+OR\b|\bOR\s+[^\n]*\bis_default\s*=\s*TRUE\b/i.test(source)) {
    violations.push(`${fileName}: is_default cannot grant Project access or imply ProjectKind`)
  }
  const projectInserts = [...source.matchAll(/INSERT\s+INTO\s+projects\s*\(([^)]*)\)/gi)]
  if (projectInserts.length > 0 && !controlledProjectWriters.has(fileName)) {
    violations.push(`${fileName}: Project creation must use a controlled Project use case`)
  }
  for (const insert of projectInserts) {
    if (!/(?:^|,)\s*kind\s*(?:,|$)/i.test(insert[1] ?? '')) {
      violations.push(`${fileName}: every Project INSERT must write an explicit canonical kind`)
    }
    if (!/(?:^|,)\s*status\s*(?:,|$)/i.test(insert[1] ?? '')) {
      violations.push(`${fileName}: every production Project INSERT must write an explicit lifecycle status`)
    }
  }
  if (fileName !== projectTransferWriter
    && /UPDATE\s+projects\s+SET[\s\S]{0,300}\bkind\s*=/i.test(source)) {
    violations.push(`${fileName}: ProjectKind is immutable outside a future transfer workflow`)
  }
  if (fileName !== projectLifecycleWriter && fileName !== projectTransferWriter
    && /UPDATE\s+projects(?:\s+\w+)?\s+SET[\s\S]{0,240}\bstatus\s*=/i.test(source)) {
    violations.push(`${fileName}: Project status writes must use the Projects lifecycle application`)
  }
  if (fileName !== companyLifecycleWriter
    && /UPDATE\s+companies(?:\s+\w+)?\s+SET[\s\S]{0,240}\bstatus\s*=/i.test(source)) {
    violations.push(`${fileName}: Company status writes must use the Companies lifecycle application`)
  }
  if (/\.patch\(\s*['"]\/projects\/:id['"]/.test(source)
    || /archive(?:Project|Course)RequestSchema|\/courses\/:id\/archive/.test(source)) {
    violations.push(`${fileName}: generic Project status mutation and legacy Course archive routes are forbidden`)
  }
}

// Membership SQL is owned by Access or by narrow persistence/lifecycle projections.
// Routers and applications must authorize through modules/access/public.ts.
const legacyMembershipSqlAllowlist = new Set([
  'server/src/agent-os/control-repository.ts',
  'server/src/im/access-repository.ts',
  'server/src/im/channels-repository.ts',
  'server/src/im/webhook-repository.ts',
  'server/src/modules/agents/repository.ts',
  'server/src/modules/calendar/repository.ts',
  'server/src/modules/companies/onboarding-repository.ts',
  'server/src/modules/companies/personal-workspace.ts',
  'server/src/modules/companies/repository.ts',
  'server/src/modules/conversations/repository.ts',
  'server/src/modules/documents/mention-repository.ts',
  'server/src/modules/access/repository.ts',
  'server/src/modules/email/address-repository.ts',
  'server/src/modules/email/agent-repository.ts',
  'server/src/modules/email/repository.ts',
  'server/src/modules/education/repository.ts',
  'server/src/modules/identity/oauth-repository.ts',
  'server/src/modules/identity/repository.ts',
  'server/src/modules/knowledge/repository.ts',
  'server/src/modules/learning/courses-repository.ts',
  'server/src/modules/learning/cases-repository.ts',
  'server/src/modules/learning/curriculum-repository.ts',
  'server/src/modules/learning/invitations-repository.ts',
  'server/src/modules/learning/learning-state-repository.ts',
  'server/src/modules/learning/missions-repository.ts',
  'server/src/modules/learning/notifications.ts',
  'server/src/modules/learning/reporting-repository.ts',
  'server/src/modules/learning/rooms-repository.ts',
  'server/src/modules/learning/teacher-approval-repository.ts',
  'server/src/modules/learning/teacher-provisioning-repository.ts',
  'server/src/modules/learning/teacher-reporting-repository.ts',
  'server/src/modules/learning/teacher-runtime-repository.ts',
  'server/src/modules/transfers/repository.ts',
  'server/src/ws.ts',
])
for (const file of server) {
  const fileName = name(file)
  if (fileName === 'server/src/db/bootstrap.ts' || fileName.startsWith('server/src/__integration__/')) continue
  const source = await read(file)
  if (/\b(?:company_memberships|project_memberships)\b/.test(source)
    && !legacyMembershipSqlAllowlist.has(fileName)) {
    violations.push(`${fileName}: direct Membership access is not in the Domain Foundation legacy allowlist`)
  }
}

const accessImplementationPattern = /modules\/access\/(?:application|contracts|context-resolver|entitlement-resolver|errors|policy|repository)\.js/
const forbiddenAuthorizationShortcut = /\b(?:user|actor|company)\.(?:isTeacher|isPro|isEnterprise|isAdmin|isPaid)\b|\busers\.is_admin\b/
const membershipRoleDecision = /\b(?:membership|companyMembership|projectMembership|companyRole|projectRole|courseRole)\b[^\n]{0,100}(?:===?|!==?)\s*['"](?:OWNER|ADMIN|TEACHER|TA|STUDENT|OBSERVER|owner|admin|teacher|learner)['"]/
const membershipRoleDecisionAllowlist = new Set([
  'server/src/modules/companies/application.ts',
  'server/src/modules/companies/personal-workspace.ts',
])
for (const file of server) {
  const fileName = name(file)
  const source = await read(file)
  if (!fileName.startsWith('server/src/modules/access/') && accessImplementationPattern.test(source)) {
    violations.push(`${fileName}: Access internals are private; import modules/access/public.ts`)
  }
  if (forbiddenAuthorizationShortcut.test(source)) {
    violations.push(`${fileName}: global identity or billing authorization shortcuts are forbidden`)
  }
  if (/\b(?:PRIVILEGED_ROLES|privilegedRoles|requireCompanyRole)\b|http\/roles\.js/.test(source)) {
    violations.push(`${fileName}: legacy role authorization helpers are forbidden`)
  }
  if (/(?:router|application)\.ts$/.test(fileName)
    && membershipRoleDecision.test(source)
    && !membershipRoleDecisionAllowlist.has(fileName)) {
    violations.push(`${fileName}: Membership Role decisions must be made by the Access policy`)
  }
}
const accessSources = (await Promise.all(
  server.filter((file) => name(file).startsWith('server/src/modules/access/')).map(read),
)).join('\n')
if (/personal_owner_user_id|personalOwnerUserId/.test(accessSources)) {
  violations.push('server/src/modules/access: personal ownership is a lifecycle invariant and cannot grant authorization')
}

for (const retired of ['src/features/admin', 'src/features/eval']) {
  if ([...frontendNames].some((fileName) => fileName.startsWith(`${retired}/`))) {
    violations.push(`${retired}: retired Admin/Eval frontend must not return; backend contracts remain authoritative`)
  }
}

for (const file of server) {
  const fileName = name(file)
  if (fileName.startsWith('server/src/engineering-control-plane/')) continue
  const source = await read(file)
  if (/engineering-control-plane\/(?:public|port)/.test(source)
    && fileName !== 'server/src/bin/engineering-control-plane.ts') {
    violations.push(`${fileName}: L4 Engineering Control Plane port is independent-deployment only`)
  }
}
for (const file of frontend) {
  const source = await read(file)
  if (/engineering-control-plane|ENGINEERING_L4/.test(source)) {
    violations.push(`${name(file)}: frontend cannot import the L4 Engineering Control Plane`)
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
if (shadcnConfig.style !== 'base-luma' || shadcnConfig.tailwind?.baseColor !== 'mist' || shadcnConfig.iconLibrary !== 'hugeicons') {
  violations.push('components.json: canonical shadcn preset b3bZWXGcRE (base-luma/mist/hugeicons) is required')
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
  ['artifact id compatibility shim', /useArtifactId|useResolved(?:Board|Card|Calendar|Document)Id/],
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
const messagesRouter = await read(resolve('server/src/modules/messages/router.ts'))
if (/\/messages\/:id\/reactions/.test(messagesRouter)) {
  violations.push('server/src/modules/messages/router.ts: retired SQL-projection reaction endpoint is forbidden')
}
if (/status\(410\)|messagesApplication\.(?:history|replies|kind)\b/.test(messagesRouter)) {
  violations.push('server/src/modules/messages/router.ts: ordinary REST chat compatibility paths are forbidden')
}
const messagesRepository = await read(resolve('server/src/modules/messages/repository.ts'))
if (/export async function (?:listMessages|listReplies|conversationKind)\b/.test(messagesRepository)
  || !/email_conversation\.kind='email'/.test(messagesRepository)) {
  violations.push('server/src/modules/messages/repository.ts: SQL message history must remain explicitly email-only')
}
const chatApi = await read(resolve('src/features/chat/api.ts'))
if (/\/conversations\/.*\/messages\/.*\/replies/.test(chatApi)) {
  violations.push('src/features/chat/api.ts: ordinary thread reads must use WuKongIM history')
}
const imMessagesApplication = await read(resolve('server/src/im/messages-application.ts'))
if (/from ['"][^'"]*db\/(?:pool|transaction)\.js['"]|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(imMessagesApplication)) {
  violations.push('server/src/im/messages-application.ts: IM message use cases bypass messages-repository.ts')
}
for (const capability of ['access', 'channels']) {
  const application = await read(resolve(`server/src/im/${capability}-application.ts`))
  if (/from ['"][^'"]*db\/(?:pool|transaction)\.js['"]|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(application)) {
    violations.push(`server/src/im/${capability}-application.ts: IM ${capability} use cases bypass their repository`)
  }
}
const imRouter = await read(resolve('server/src/im/router.ts'))
if (/from ['"]\.\/(?:access|channels|messages)-(?:application|repository)\.js['"]/.test(imRouter)) {
  violations.push('server/src/im/router.ts: IM routes must use capability facades')
}
if (/im_send_acceptances/.test(imRouter)) {
  violations.push('server/src/im/router.ts: IM send acceptance persistence must stay in messages-repository.ts')
}
if (/\.post\(['"]\/channels['"]/.test(imRouter)) {
  violations.push('server/src/im/router.ts: retired client-side channel creation endpoint is forbidden')
}
const readReceiptFacade = await read(resolve('server/src/im/read-receipts.ts'))
const readReceiptApplication = await read(resolve('server/src/im/read-receipts-application.ts'))
if (/`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`/is.test(`${readReceiptFacade}\n${readReceiptApplication}`)) {
  violations.push('server/src/im/read-receipts: SQL must stay in read-receipts-repository.ts')
}
const agentControlApplication = await read(resolve('server/src/agent-os/control-application.ts'))
if (/from ['"][^'"]*db\/(?:pool|transaction)\.js['"]|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(agentControlApplication)) {
  violations.push('server/src/agent-os/control-application.ts: Agent control use cases bypass control-repository.ts')
}
const agentApprovalApplication = await read(resolve('server/src/agent-os/approval-application.ts'))
if (/from ['"][^'"]*db\/(?:pool|transaction)\.js['"]|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(agentApprovalApplication)) {
  violations.push('server/src/agent-os/approval-application.ts: Agent approval use cases bypass approval-repository.ts')
}
if (/agent-os\/(?:approval|control)-(?:application|repository)\.js/.test(imRouter)) {
  violations.push('server/src/im/router.ts: Agent OS access must use agent-os/public.ts')
}
if (/from ['"][^'"]*db\/|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(imRouter)) {
  violations.push('server/src/im/router.ts: IM router must not own SQL or database infrastructure')
}
if (/\b(?:process\.env|wukongClient\s*\()/.test(imRouter)) {
  violations.push('server/src/im/router.ts: IM router must use session and capability facades')
}
const wukongWebhookRouter = await read(resolve('server/src/im/webhook.ts'))
const wukongWebhookApplication = await read(resolve('server/src/im/webhook-application.ts'))
if (/from ['"][^'"]*db\/|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b|wukongClient\s*\(/i.test(wukongWebhookRouter)) {
  violations.push('server/src/im/webhook.ts: WuKong webhook router must only verify, parse, and map HTTP')
}
if (/from ['"][^'"]*db\/(?:pool|transaction)\.js['"]|\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(wukongWebhookApplication)) {
  violations.push('server/src/im/webhook-application.ts: WuKong webhook use cases bypass webhook-repository.ts')
}
for (const configFile of ['.env.example', '.env.local.example', 'docker-compose.mvp.yml', 'docker-compose.mvp.ci.yml', 'docker-compose.production.yml']) {
  if (/WUKONG_WEBHOOK_ALLOW_UNSIGNED_INTERNAL/.test(await read(resolve(configFile)))) {
    violations.push(`${configFile}: unsigned WuKong webhook fallback is forbidden`)
  }
}
const metricsSource = await read(resolve('server/src/metrics.ts'))
if (/['"]email\.send\.(?:ok|fail)['"]\s*:\s*\{[^}]*labels:\s*\[[^\]]*mock/s.test(metricsSource)) {
  violations.push('server/src/metrics.ts: retired email mock dimension is forbidden')
}
const emailProvider = await read(resolve('server/src/modules/email/provider.ts'))
const emailApplication = await read(resolve('server/src/modules/email/application.ts'))
const emailRuntime = await read(resolve('server/src/modules/email/runtime.ts'))
if (/fallbackSmtpMessageId|args\.messageId\s*\?\?\s*mintMessageId/.test(`${emailProvider}\n${emailApplication}\n${emailRuntime}`)) {
  violations.push('server/src/modules/email: provider success must preserve the authoritative Message-ID without fallback minting')
}
const agentCli = await read(resolve('server/src/agents/cli.ts'))
if (/\bfetch\s*\(/.test(agentCli) || !/response_format:\s*['"]b64_json['"]/.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: generated images must use tracked b64_json output and authoritative R2 storage')
}
if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+messages\b|conversation_counters|CH_MESSAGE_NEW/i.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: Agent chat sends must not restore the PostgreSQL/Redis message data plane')
}
if (/FROM\s+messages\b|JOIN\s+messages\b|conversation_reads/i.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: Agent chat reads and unread state must remain authoritative in WuKong')
}
if (!/from ['"]\.\.\/im\/public\.js['"]/.test(agentCli) || !/sendAgentChannelMessage\s*\(/.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: Agent chat sends must use the public authoritative IM application')
}
if (/`attachments\/\$\{id\}/.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: R2 attachment keys must be scoped by the trusted company identity')
}
for (const [command, nextCommand] of [['Messages', 'Thread'], ['Glance', 'Ack']]) {
  const body = agentCli.match(new RegExp(`async function cmd${command}\\b[\\s\\S]*?(?=async function cmd${nextCommand}\\b)`))?.[0] ?? ''
  if (!body || /FROM\s+messages\b|JOIN\s+messages\b/i.test(body) || !/getAgentChannelHistory\s*\(/.test(body)) {
    violations.push(`server/src/agents/cli.ts: cmd${command} must read authoritative WuKong history through im/public.ts`)
  }
}
const agentInboxBody = agentCli.match(/async function loadInbox\b[\s\S]*?(?=async function cmdGlance\b)/)?.[0] ?? ''
const agentAckBody = agentCli.match(/async function cmdAck\b[\s\S]*?(?=const \{ cmdFollow)/)?.[0] ?? ''
if (!agentInboxBody || /FROM\s+messages\b|JOIN\s+messages\b|conversation_reads/i.test(agentInboxBody) || !/getAgentInbox\s*\(/.test(agentInboxBody)) {
  violations.push('server/src/agents/cli.ts: Agent inbox must use WuKong unread/history through im/public.ts')
}
if (!agentAckBody || /conversation_reads/i.test(agentAckBody) || !/clear(?:AgentChannel|AllAgent)Unread\s*\(/.test(agentAckBody)) {
  violations.push('server/src/agents/cli.ts: Agent ack must clear authoritative WuKong unread state through im/public.ts')
}
const agentSearchBody = agentCli.match(/async function cmdSearch\b[\s\S]*?(?=async function cmdToolsLog\b)/)?.[0] ?? ''
if (!agentSearchBody || !/searchAgentMessages\s*\(/.test(agentSearchBody)) {
  violations.push('server/src/agents/cli.ts: Agent message search must use paged WuKong history through im/public.ts')
}
const agentReactBody = agentCli.match(/async function cmdReact\b[\s\S]*?(?=function buildToolArgs\b)/)?.[0] ?? ''
if (!agentReactBody || !/toggleAgentChannelReaction\s*\(/.test(agentReactBody) || /runTool\s*\(\s*['"]react/.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: Agent reactions must use an explicit channel and the public IM application')
}
const schemaSql = await read(resolve('server/src/db/schema.sql'))
const workerBoot = await read(resolve('server/src/worker.ts'))
const packageManifest = await read(resolve('package.json'))
if (/drizzle-(?:orm|kit)/.test(packageManifest) || serverNames.has('server/src/db/schema.ts')) {
  violations.push('database: retired parallel Drizzle schema and migration toolchain must not return')
}
if (/seedIfEmpty|from ['"]\.\/seed\.js['"]/.test(workerBoot) || serverNames.has('server/src/seed.ts')) {
  violations.push('server/src/worker.ts: production runtime must not create demo users, conversations, or messages')
}
for (const file of server) {
  const fileName = name(file)
  if (fileName.includes('/__integration__/')) continue
  const source = await read(file)
  if (/\bconversation_counters\b/.test(source)) {
    violations.push(`${fileName}: generic SQL conversation sequence counters are forbidden`)
  }
  if (/\bemail_sequence_counters\b/.test(source)
    && !new Set([
      'server/src/db/bootstrap.ts',
      'server/src/modules/email/message-repository.ts',
      'server/src/modules/transfers/repository.ts',
    ]).has(fileName)) {
    violations.push(`${fileName}: email sequence counters must stay inside the email persistence boundary`)
  }
  if (/\bpoll_votes\b/.test(source)) {
    violations.push(`${fileName}: legacy SQL-message poll votes are forbidden; use im_poll_votes`)
  }
}
if (/CREATE TABLE public\.(?:messages|poll_votes)\b|poll_votes_message_id_fkey|\bconversation_counters\b/.test(schemaSql)) {
  violations.push('server/src/db/schema.sql: generic SQL chat storage and counters must not return')
}
for (const observabilityFile of [
  'server/src/agents/observability.ts',
  'server/src/modules/observability/repository.ts',
]) {
  if (/\b(?:FROM|JOIN)\s+messages\b/i.test(await read(resolve(observabilityFile)))) {
    violations.push(`${observabilityFile}: run visibility must use explicit trigger channel identities`)
  }
}
const canvasReportsRepository = await read(resolve('server/src/modules/canvas/reports-repository.ts'))
const canvasFacade = await read(resolve('server/src/modules/canvas/facade.ts'))
if (/\b(?:FROM|JOIN)\s+messages\b/i.test(canvasReportsRepository)
  || !/missingAgentChannelMessageIds\s*\(/.test(canvasFacade)) {
  violations.push('server/src/modules/canvas: message evidence must be verified through the public authoritative IM application')
}
const membershipMessages = await read(resolve('server/src/agents/membership.ts'))
if (/from ['"][^'"]*(?:db\/|redis\.js)|\b(?:pool|db)\.query\s*\(|conversation_counters|CH_MESSAGE_NEW|INSERT\s+INTO\s+messages/i.test(membershipMessages)
  || !/sendSystemChannelMessage\s*\(/.test(membershipMessages)) {
  violations.push('server/src/agents/membership.ts: membership activity must publish through the public authoritative IM application')
}
const coworker = await read(resolve('server/src/agents/coworker.ts'))
if (/from ['"][^'"]*redis\.js|conversation_counters|\b(?:FROM|JOIN|INSERT INTO|UPDATE|DELETE FROM)\s+messages\b|CH_MESSAGE_NEW|publishMessage/i.test(coworker)
  || !/sendSystemChannelMessage\s*\(/.test(coworker)
  || !/clientNonce:\s*`(?:handoff|approval):/.test(coworker)) {
  violations.push('server/src/agents/coworker.ts: handoff and approval cards must be immutable authoritative IM snapshots')
}
for (const retiredConstraint of [
  'agent_approvals_message_id_fkey',
  'agent_handoffs_source_message_id_fkey',
  'agent_handoffs_result_message_id_fkey',
  'tool_calls_message_id_fkey',
]) {
  if (schemaSql.includes(retiredConstraint)) {
    violations.push(`server/src/db/schema.sql: ${retiredConstraint} must not bind WuKong identities to SQL messages`)
  }
}
const calendarRepository = await read(resolve('server/src/modules/calendar/repository.ts'))
const calendarScheduler = await read(resolve('server/src/modules/calendar/scheduler.ts'))
if (/conversation_counters|INSERT\s+INTO\s+messages/i.test(calendarRepository)
  || !/publishDispatchMessage\s*\(/.test(calendarScheduler)
  || !/calendar-dispatch:\$\{createHash\(['"]sha256['"]\)/.test(calendarScheduler)) {
  violations.push('server/src/modules/calendar: dispatch messages must use stable identities and the authoritative IM application')
}
const agentMembershipBody = agentCli.match(/async function cmdLeave\b[\s\S]*?(?=async function cmdReply\b)/)?.[0] ?? ''
if (!agentMembershipBody || /\bpool\.query\s*\(|UPDATE\s+conversations/i.test(agentMembershipBody)
  || !/leaveAgentConversation\s*\(/.test(agentMembershipBody)
  || !/addAgentConversationMember\s*\(/.test(agentMembershipBody)
  || /function cmdKick\b|case ['"]kick['"]/.test(agentCli)) {
  violations.push('server/src/agents/cli.ts: membership commands must use Conversations public application and retired kick must stay absent')
}
const conversationsRepository = await read(resolve('server/src/modules/conversations/repository.ts'))
const conversationsApplication = await read(resolve('server/src/modules/conversations/application.ts'))
if (/FROM\s+messages\b|JOIN\s+messages\b/i.test(conversationsRepository)) {
  violations.push('server/src/modules/conversations/repository.ts: conversation search must not restore the SQL message data plane')
}
const conversationSearchBody = conversationsApplication.match(/async search\b[\s\S]*?(?=private async simpleProfileMutation\b)/)?.[0] ?? ''
if (!conversationSearchBody || !/infrastructure\.searchMessages\s*\(/.test(conversationSearchBody)) {
  violations.push('server/src/modules/conversations/application.ts: message search must use the public authoritative IM capability')
}

const evalService = await read(resolve('server/src/eval/service.ts'))
if (/from ['"][^'"]*db\//.test(evalService) || /\b(?:pool|client|db)\.query\s*\(|`\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(evalService)) {
  violations.push('server/src/eval/service.ts: Eval application logic bypasses repository.ts')
}

// Domains enter this set only after their router/application/repository split
// is complete. Keeping the assertion here makes a later regression impossible
// while the remaining domains are migrated deliberately.
const strictServerDomains = new Set(['agents', 'boards', 'calendar', 'canvas', 'companies', 'conversations', 'documents', 'email', 'identity', 'knowledge', 'learning', 'messages', 'observability', 'platform', 'polls', 'projects'])

for (const file of server) {
  const source = await read(file)
  const fileName = name(file)
  if (fileName === 'server/src/admin.ts') violations.push(`${fileName}: retired root admin implementation is forbidden`)
  if (fileName.startsWith('server/src/modules/admin/')) violations.push(`${fileName}: retired product Admin module is forbidden`)
  if (fileName === 'server/src/alert.ts') violations.push(`${fileName}: operational alerts must use alerting.ts`)
  if (fileName === 'server/src/avatar.ts') violations.push(`${fileName}: identity avatar transport must remain inside modules/identity`)
  if (fileName === 'server/src/email.ts') violations.push(`${fileName}: retired root email implementation is forbidden`)
  if (fileName === 'server/src/invitation-email.ts') violations.push(`${fileName}: Companies email capability must remain inside its vertical slice`)
  if (fileName === 'server/src/email-retry.ts' || fileName === 'server/src/email-gc.ts' || fileName === 'server/src/api/inbound-email.ts') {
    violations.push(`${fileName}: retired root Email capability is forbidden`)
  }
  if (fileName === 'server/src/oauth.ts') violations.push(`${fileName}: retired root OAuth implementation is forbidden`)
  if (fileName === 'server/src/oidc.ts') violations.push(`${fileName}: LingxiIdentity HTTP must remain inside its infrastructure entrypoint`)
  if (fileName === 'server/src/status.ts') violations.push(`${fileName}: participant presence must remain inside the Agents vertical slice`)
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
  if (!fileName.startsWith('server/src/modules/messages/')
    && /modules\/messages\/(?:application|contracts|facade|repository)\.js/.test(source)) {
    violations.push(`${fileName}: Messages internals must be accessed through public.ts`)
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
  if (/x-lingxiloop-dev-mode|EMAIL_MOCK_FAIL_RATE|EMAIL_INBOUND_HMAC_SECRET|WUKONG_WEBHOOK_ALLOW_UNSIGNED_INTERNAL|SUB2API|DEEPSEEK_API_KEY|DISCORD_ALERT_WEBHOOK_URL/.test(source)) violations.push(`${fileName}: retired production switch is forbidden`)
  if (/agent-gender|agent-avatar|generateAndPersistAvatar|visualSignatureFor|cmdAvatar\b|\/avatar\/generate/.test(source)) violations.push(`${fileName}: agent portraits are retired; agents use Bloub`)
  if (/participants\.avatar/.test(source)) violations.push(`${fileName}: retired participant avatar event is forbidden`)
  if (/\/devtools\//.test(source) || /api\.post\(['"]\/uploads['"]/.test(source) || /sources\/upload['"]/.test(source)) violations.push(`${fileName}: retired endpoint is forbidden`)
  const domainRouter = fileName.match(/^server\/src\/modules\/([^/]+)\/(?:[a-z-]+-)?router\.ts$/)?.[1]
  if (domainRouter && strictServerDomains.has(domainRouter)) {
    if (/from ['"][^'"]*db\//.test(source) || /\b(?:pool|db)\.query\b/.test(source)) violations.push(`${fileName}: router bypasses its repository`)
    if (/`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*`/is.test(source)) violations.push(`${fileName}: router contains SQL`)
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
      'server/src/modules/identity/avatar-infrastructure.ts',
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

try {
  await access(resolve('workers/email-gate/src/index.ts'))
  violations.push('workers/email-gate: retired Cloudflare inbound data plane must not return')
} catch {
  // Expected: Resend Receiving is the only inbound email provider.
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
