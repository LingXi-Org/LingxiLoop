import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSoundStore } from '@/stores/sound'
import { useTheme } from '@/stores/theme'
import { SettingsGroup, SettingsRow } from './SettingsComponents'

export function AppearanceSoundSettingsPanel() {
  const { theme, setTheme } = useTheme()
  const muted = useSoundStore((state) => state.muted)
  const setMuted = useSoundStore((state) => state.setMuted)

  return (
    <div className="space-y-6">
      <SettingsGroup title="外观" description="外观选择只保存在这台设备上，并会立即生效。">
        <SettingsRow title="主题" description="选择浅色或深色界面。">
          <Select value={theme} onValueChange={(value) => setTheme(value === 'light' ? 'light' : 'dark')}>
            <SelectTrigger size="sm" aria-label="主题">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">浅色</SelectItem>
              <SelectItem value="dark">深色</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="声音" description="声音偏好只影响当前设备。">
        <SettingsRow title="消息音效" description="在消息中遇到带声音的表情时播放音效。">
          <Switch
            aria-label="消息音效"
            checked={!muted}
            onCheckedChange={(checked) => setMuted(!checked)}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
