import { Download04Icon, RefreshCwIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useUpdater } from '@/components/UpdaterDialog'
import { Button } from '@/components/ui/button'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { toastAction } from '@/lib/actionToast'
import { userFacingError } from '@/lib/userFacingError'
import { isElectron } from '@/lib/runtime'
import { SettingsGroup, SettingsPanelSkeleton, SettingsRow } from './SettingsComponents'

function updateStatusText(status: ReturnType<typeof useUpdater>['status']): string {
  switch (status.status) {
    case 'idle': return '可以手动检查是否有新版本。'
    case 'checking': return '正在检查更新…'
    case 'update-not-available': return '当前已是最新版本。'
    case 'update-available': return status.version ? `发现新版本 ${status.version}。` : '发现可用的新版本。'
    case 'downloading': return '正在下载更新。'
    case 'update-downloaded': return '更新已下载，重新启动后即可安装。'
    case 'error': return '检查或下载更新时遇到问题。'
    case 'unsupported': return '当前安装方式不支持应用内更新。'
  }
}

export function UpdateSettingsPanel() {
  const { ready, appInfo, status, check, download, install } = useUpdater()
  const [action, setAction] = useState<'check' | 'download' | 'install' | null>(null)

  if (!ready) return <SettingsPanelSkeleton rows={2} />

  const supported = appInfo?.autoUpdateSupported === true && status.status !== 'unsupported'
  const browserVersion = !isElectron
  const busy = action !== null || status.status === 'checking' || status.status === 'downloading'

  const runUpdateAction = async (
    kind: NonNullable<typeof action>,
    task: () => Promise<void>,
    messages: { loading: string; success: string; error: string },
  ) => {
    if (action) return
    setAction(kind)
    try {
      await toastAction(task(), messages)
    } catch {
      // The shared Toast owns the user-visible error state.
    } finally {
      setAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsGroup title="LingxiLoop" description="应用更新由当前安装渠道提供。">
        <SettingsRow title="当前版本">
          <span className="font-mono text-sm text-muted-foreground">{appInfo?.version ?? '—'}</span>
        </SettingsRow>
        <SettingsRow title="更新状态" description={updateStatusText(status)}>
          {supported && (status.status === 'idle' || status.status === 'update-not-available' || status.status === 'error') && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void runUpdateAction('check', check, {
                loading: '正在检查更新…',
                success: '更新检查已完成',
                error: '检查更新失败，请稍后再试',
              })}
            >
              <HugeiconsIcon icon={RefreshCwIcon} strokeWidth={2} data-icon="inline-start" />
              检查更新
            </Button>
          )}
          {supported && status.status === 'update-available' && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void runUpdateAction('download', download, {
                loading: '正在开始下载更新…',
                success: '更新下载已开始',
                error: '下载更新失败，请稍后再试',
              })}
            >
              <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" />
              下载更新
            </Button>
          )}
          {supported && status.status === 'update-downloaded' && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void runUpdateAction('install', install, {
                loading: '正在准备重新启动…',
                success: '正在重新启动并安装更新',
                error: '无法安装更新，请稍后再试',
              })}
            >
              重新启动并安装
            </Button>
          )}
          {status.status === 'checking' && <span className="text-xs text-muted-foreground">请稍候</span>}
          {!supported && <span className="text-xs text-muted-foreground">{browserVersion ? '浏览器版会自动保持最新' : '由安装渠道管理'}</span>}
        </SettingsRow>
        {status.status === 'downloading' && (
          <div className="px-4 py-4">
            <Progress value={status.percent ?? 0}>
              <ProgressLabel>下载进度</ProgressLabel>
              <ProgressValue>{(_formattedValue, value) => `${Math.round(value ?? 0)}%`}</ProgressValue>
            </Progress>
          </div>
        )}
        {status.status === 'error' && status.detail && (
          <div className="px-4 py-3 text-xs leading-5 text-destructive">
            {userFacingError(status.detail, '更新服务暂时不可用，请稍后再试。')}
          </div>
        )}
      </SettingsGroup>
    </div>
  )
}
