import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { learningApi } from '@/features/learning/api'
import type { LearningNotificationPreferences } from '@/features/learning/contracts'
import { useWorkspace } from '@/features/knowledge/workspace'
import { toastAction } from '@/lib/actionToast'
import { SettingsGroup, SettingsPanelSkeleton, SettingsRow } from './SettingsComponents'

const WEEKDAYS = [
  [1, '周一'],
  [2, '周二'],
  [3, '周三'],
  [4, '周四'],
  [5, '周五'],
  [6, '周六'],
  [7, '周日'],
] as const

type LoadState = 'loading' | 'ready' | 'error' | 'unavailable'

function shortTime(value: string | null): string {
  return value?.slice(0, 5) ?? ''
}

export function NotificationSettingsPanel() {
  const workspaces = useWorkspace((state) => state.list)
  const selectedWorkspaceId = useWorkspace((state) => state.selectedId)
  const workspaceLoaded = useWorkspace((state) => state.loaded)
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [preferences, setPreferences] = useState<LearningNotificationPreferences | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!workspaceLoaded) {
      setLoadState('loading')
      return
    }
    if (!selectedWorkspaceId || !selectedWorkspace) {
      setPreferences(null)
      setLoadState('unavailable')
      return
    }

    let cancelled = false
    setLoadState('loading')
    void learningApi.getNotificationPreferences(selectedWorkspaceId).then((next) => {
      if (cancelled) return
      setPreferences(next)
      setLoadState('ready')
    }).catch(() => {
      if (!cancelled) setLoadState('error')
    })
    return () => { cancelled = true }
  }, [reloadKey, selectedWorkspace, selectedWorkspaceId, workspaceLoaded])

  if (loadState === 'loading') return <SettingsPanelSkeleton rows={5} />

  if (loadState === 'unavailable') {
    return (
      <Alert>
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
        <AlertTitle>还没有当前学习区</AlertTitle>
        <AlertDescription>选择一个个人学习区或课程后，即可管理对应的通知偏好。</AlertDescription>
      </Alert>
    )
  }

  if (loadState === 'error' || !preferences || !selectedWorkspace) {
    return (
      <Alert variant="destructive">
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
        <AlertTitle>通知设置加载失败</AlertTitle>
        <AlertDescription>暂时无法读取当前学习区的通知偏好，请稍后重试。</AlertDescription>
        <AlertAction>
          <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            重试
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  const updatePreference = <Key extends keyof LearningNotificationPreferences>(
    key: Key,
    value: LearningNotificationPreferences[Key],
  ) => setPreferences((current) => current ? { ...current, [key]: value } : current)

  const savePreferences = async () => {
    if (saving) return
    setSaving(true)
    try {
      const next = await toastAction(learningApi.setNotificationPreferences({
        projectId: selectedWorkspace.id,
        inAppEnabled: preferences.in_app_enabled,
        emailEnabled: preferences.email_enabled,
        timezone: preferences.timezone.trim(),
        dailyTime: shortTime(preferences.daily_time),
        weeklyDay: preferences.weekly_day,
        quietStart: preferences.quiet_start ? shortTime(preferences.quiet_start) : null,
        quietEnd: preferences.quiet_end ? shortTime(preferences.quiet_end) : null,
      }), {
        loading: '正在保存通知设置…',
        success: `已保存“${selectedWorkspace.name}”的通知设置`,
        error: '通知设置保存失败，请稍后再试',
      })
      setPreferences(next)
    } catch {
      // The shared Toast owns the user-visible error state.
    } finally {
      setSaving(false)
    }
  }

  const canSave = preferences.timezone.trim().length > 0 && shortTime(preferences.daily_time).length === 5

  return (
    <div className="space-y-6">
      <SettingsGroup
        title={selectedWorkspace.name}
        description="这些偏好只适用于当前学习区。切换学习区后可分别设置。"
      >
        <SettingsRow title="应用内通知" description="在 LingxiLoop 内接收学习提醒与摘要。">
          <Switch
            aria-label="应用内通知"
            checked={preferences.in_app_enabled}
            onCheckedChange={(checked) => updatePreference('in_app_enabled', checked)}
          />
        </SettingsRow>
        <SettingsRow title="邮件通知" description="将学习提醒与摘要发送到账号邮箱。">
          <Switch
            aria-label="邮件通知"
            checked={preferences.email_enabled}
            onCheckedChange={(checked) => updatePreference('email_enabled', checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="摘要时间" description="设置每日与每周摘要的本地发送时间。">
        <SettingsRow title="时区">
          <Input
            className="w-48"
            aria-label="通知时区"
            value={preferences.timezone}
            onChange={(event) => updatePreference('timezone', event.target.value)}
            placeholder="例如 Asia/Shanghai"
          />
        </SettingsRow>
        <SettingsRow title="发送时间">
          <Input
            className="w-32"
            type="time"
            aria-label="每日和每周摘要发送时间"
            value={shortTime(preferences.daily_time)}
            onChange={(event) => updatePreference('daily_time', event.target.value)}
          />
        </SettingsRow>
        <SettingsRow title="每周发送日">
          <Select
            value={String(preferences.weekly_day)}
            onValueChange={(value) => updatePreference('weekly_day', Number(value))}
          >
            <SelectTrigger size="sm" aria-label="每周摘要发送日"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map(([value, label]) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="安静时段" description="留空表示不设置安静时段。">
        <SettingsRow title="开始时间">
          <Input
            className="w-32"
            type="time"
            aria-label="安静时段开始时间"
            value={shortTime(preferences.quiet_start)}
            onChange={(event) => updatePreference('quiet_start', event.target.value || null)}
          />
        </SettingsRow>
        <SettingsRow title="结束时间">
          <Input
            className="w-32"
            type="time"
            aria-label="安静时段结束时间"
            value={shortTime(preferences.quiet_end)}
            onChange={(event) => updatePreference('quiet_end', event.target.value || null)}
          />
        </SettingsRow>
      </SettingsGroup>

      <div className="flex justify-end">
        <Button type="button" disabled={!canSave || saving} onClick={() => void savePreferences()}>
          {saving ? '正在保存…' : '保存通知设置'}
        </Button>
      </div>
    </div>
  )
}
