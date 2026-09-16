import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

test('settings uses desktop dialog and mobile drawer compositions with every account section', () => {
  const dialog = read('./SettingsDialog.tsx')

  assert.match(dialog, /<Dialog open=\{open\} onOpenChange=\{setOpen\}>/)
  assert.match(dialog, /<DialogContent[\s\S]*?<SidebarProvider[\s\S]*?<Sidebar[\s\S]*?<SidebarInset/)
  assert.match(dialog, /onCloseAutoFocus=[\s\S]*SETTINGS_DIALOG_TRIGGER_ID[\s\S]*\.focus\(\)/)
  assert.match(dialog, /if \(isMobile\) return \([\s\S]*?<Drawer[\s\S]*?<TabsList/)
  assert.match(dialog, /data-account'[\s\S]*?'退出登录与账号'/)
  assert.doesNotMatch(dialog, /\bSheet\b/)

  for (const label of ['账号', '外观与声音', '通知', '数据与账号']) {
    assert.ok(dialog.includes(`label: '${label}'`), `missing settings section: ${label}`)
  }
})

test('settings surfaces only existing theme, sound, notification, and account APIs', () => {
  const appearance = read('./AppearanceSoundSettingsPanel.tsx')
  const account = read('./AccountSettingsPanel.tsx')
  const notification = read('./NotificationSettingsPanel.tsx')
  const dataAccount = read('./DataAccountSettingsPanel.tsx')

  assert.match(appearance, /useTheme\(\)/)
  assert.match(appearance, /useSoundStore/)
  assert.match(appearance, /消息音效/)
  assert.match(account, /灵犀账号/)
  assert.doesNotMatch(account, /user\.providers|Lingxi Identity/)
  assert.match(notification, /getNotificationPreferences\(selectedWorkspaceId\)/)
  assert.match(notification, /toastAction\(learningApi\.setNotificationPreferences/)
  assert.doesNotMatch(notification, /设备推送|不可用/)
  assert.match(dataAccount, /authApi\.signOut\(\)/)
  assert.doesNotMatch(`${appearance}\n${dataAccount}`, /语言|发布渠道|稳定通道|永久删除全部数据|关联数据无法恢复/)
})

test('settings provides Chinese loading and account menu affordances', () => {
  const components = read('./SettingsComponents.tsx')
  const navUser = read('../../components/nav-user.tsx')

  assert.match(components, /<Skeleton/)
  assert.match(components, /aria-label="正在加载设置"/)
  assert.match(navUser, /openSettingsDialog/)
  assert.match(navUser, /id=\{SETTINGS_DIALOG_TRIGGER_ID\}/)
  assert.ok(navUser.indexOf('设置\n') < navUser.indexOf('退出登录'), '设置 should appear immediately before 退出登录')
  assert.match(navUser, /@hugeicons\/react/)
  assert.doesNotMatch(navUser, /lucide-react/)
})

test('company controls move out of settings while account exit and both avatar menus remain', () => {
  const dialog = read('./SettingsDialog.tsx'), account = read('./AccountSettingsPanel.tsx'), menu = read('../../components/nav-user.tsx')
  assert.doesNotMatch(dialog, /CompanySettingsPanel|公司与成员|case 'company'/)
  assert.doesNotMatch(read('./store.ts'), /\| 'company'/)
  assert.match(account, /companiesApi.leaveCompany\(company.id\)/)
  assert.match(account, /最后一位管理员须先交接/)
  assert.match(account, /useAuth.getState\(\).clear\(\)/)
  assert.match(menu, /isCompanyAdmin && <DropdownMenuItem/)
  assert.match(menu, /https:\/\/admin.lingxilearn.cn/)
  assert.match(menu, /target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(menu, /if \(isMobile\) return|onClick=\{isMobile/)
})

test('mobile conversation routing and Better Auth entry points stay wired', () => {
  const mobile = read('../../desktop/DesktopApp.tsx')
  const mobileHook = read('../../hooks/use-mobile.ts')
  const auth = read('../../components/AuthScreen.tsx')
  const authApi = read('../../auth/api.ts')

  assert.match(mobileHook, /const MOBILE_BREAKPOINT = 768/)
  assert.match(mobile, /const mobileChatOpen = isMobile && mobileConversationOpen/)
  assert.match(mobile, /data-mobile-conversation-page=\{mobileChatOpen \? 'chat' : 'list'\}/)
  assert.match(mobile, /<ConversationsPane onConversationSelected=\{\(\) => setMobileConversationOpen\(true\)\}/)
  assert.match(auth, /<TabsTrigger value="login">登录<\/TabsTrigger>/)
  assert.match(auth, /<TabsTrigger value="signup">注册<\/TabsTrigger>/)
  assert.match(auth, /const TURNSTILE_SITE_KEY = import\.meta\.env\.VITE_TURNSTILE_SITE_KEY/)
  assert.match(authApi, /signIn:[\s\S]*signUp:[\s\S]*x-captcha-response/)
})

test('invitation landing stays reachable on both sides of the session gate and clears on completion', () => {
  const app = read('../../App.tsx')
  const gate = read('../../components/AuthGate.tsx')

  assert.match(app, /useState\(consumeInviteFromUrl\)/)
  assert.match(app, /invitation\?\.clear\(\)\s+setInvitation\(null\)/)
  assert.match(app, /invitation\s*\? <InviteAcceptScreen token=\{invitation.token\} onDone=\{finishInvitation\} \/>\s*: null/)
  assert.match(app, /<AuthGate unauthFallback=\{invitationScreen\}>/)
  assert.match(app, /\{invitationScreen \?\? <AuthedApp/)
  assert.match(gate, /authApi.session\(\)/)
  assert.match(gate, /unauthFallback \?\? <AuthScreen \/>/)
})


test('course settings uses a left-hand breadcrumb with an accessible category menu and no duplicate page heading', () => {
  const settings = read('../learning/dashboard/CourseSettingsSection.tsx')
  const profile = read('../learning/dashboard/CourseProfileSettings.tsx')
  const account = read('./AccountSettingsPanel.tsx')
  assert.match(settings, /breadcrumb=\{\{ root: '课程设置', onBack: \(\) => setSection\('profile'\)/)
  assert.match(settings, /DropdownMenuRadioGroup value=\{section\} onValueChange=\{setSection\}/)
  assert.match(settings, /description=\{current.description\}/)
  assert.doesNotMatch(settings, /TabsList|TabsTrigger/)
  assert.doesNotMatch(profile, /<CardTitle>基本资料|<CardDescription>/)
  assert.doesNotMatch(account, /title="账号资料"|仅供查看/)
})


test('avatar changes live in a dialog opened by the current avatar', () => {
  const editor = read('./AvatarEditor.tsx')
  const account = read('./AccountSettingsPanel.tsx')
  const profile = read('../learning/dashboard/CourseProfileSettings.tsx')
  assert.match(editor, /<DialogTrigger asChild>[\s\S]*?<Button[^>]*aria-label=\{title\}[\s\S]*?<AvatarImage src=\{currentUrl\}/)
  assert.match(editor, /<DialogContent[\s\S]*?<DialogTitle>[\s\S]*?随机换一个[\s\S]*?type="file"[\s\S]*?<DialogFooter>/)
  assert.doesNotMatch(account, /随机换一个|上传图片|保存头像/)
  assert.match(account, /onSave=\{save\}/)
  assert.match(profile, /onSave=\{saveAvatar\}/)
  assert.match(profile, /updateCourse\(course.id, \{ avatar \}\)/)
})


test('account identity groups the editable avatar with name and email without repeating either field', () => {
  const account = read('./AccountSettingsPanel.tsx')
  assert.match(account, /flex items-center gap-4[\s\S]*?<AvatarEditor[\s\S]*?<h3[^>]*>\{user.name\}<\/h3>[\s\S]*?\{user.email\}/)
  assert.equal(account.match(/\{user.name\}/g)?.length, 1)
  assert.equal(account.match(/\{user.email\}/g)?.length, 1)
  assert.match(account, /<dl[\s\S]*?<dt[^>]*>登录方式[\s\S]*?<dt[^>]*>邮箱状态/)
})
