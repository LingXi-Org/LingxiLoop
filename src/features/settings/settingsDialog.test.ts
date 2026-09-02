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
  const authApi = read('../../auth/api.ts')

  assert.match(appearance, /useTheme\(\)/)
  assert.match(appearance, /useSoundStore/)
  assert.match(appearance, /消息音效/)
  assert.match(account, /灵犀账号/)
  assert.doesNotMatch(account, /user\.providers|Lingxi Identity/)
  assert.match(notification, /getNotificationPreferences\(selectedWorkspaceId\)/)
  assert.match(notification, /toastAction\(learningApi\.setNotificationPreferences/)
  assert.doesNotMatch(notification, /设备推送|不可用/)
  assert.match(dataAccount, /authApi\.signOut\(\)/)
  assert.match(dataAccount, /promptSensitiveAction/)
  assert.match(dataAccount, /confirmation !== ACCOUNT_DELETE_CONFIRMATION/)
  assert.match(dataAccount, /toastAction\(authApi\.deleteAccount\(\)/)
  assert.match(authApi, /deleteAccount: \(\) => http<DeleteAccountResponse>\('\/me\/account', \{ method: 'DELETE' \}\)/)
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
