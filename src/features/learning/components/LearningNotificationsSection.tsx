import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useApp } from '@/stores/app'
import { learningApi } from '../api'
import type { LearningCourse, LearningDelivery, LearningNotificationPreferences } from '../contracts'
import { DELIVERY_CHANNEL_LABELS, statusLabel } from './learningDisplay'

interface LearningNotificationsSectionProps {
  course: LearningCourse
  preferences: LearningNotificationPreferences
  setPreferences: Dispatch<SetStateAction<LearningNotificationPreferences>>
  deliveries: LearningDelivery[]
  onError(error: unknown): void
}

export function LearningNotificationsSection({
  course, preferences, setPreferences, deliveries, onError,
}: LearningNotificationsSectionProps) {
  const selectConversation = useApp((state) => state.selectConversation)
  const update = <Key extends keyof LearningNotificationPreferences>(
    key: Key,
    value: LearningNotificationPreferences[Key],
  ) => setPreferences((current) => ({ ...current, [key]: value }))

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>提醒与摘要</CardTitle>
        <CardDescription>支持即时、每日、每周和正式通知；正文只包含摘要与上下文链接，不包含答案、分数或私聊内容。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['in_app_enabled', '应用内'], ['email_enabled', '邮件'],
          ] as const).map(([key, label]) => (
            <FieldLabel key={key} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-3 font-medium">
              <span>{label}</span>
              <Checkbox checked={preferences[key]} onCheckedChange={(checked) => update(key, checked === true)} />
            </FieldLabel>
          ))}
          <Field><FieldLabel>时区</FieldLabel>
            <Input value={preferences.timezone} onChange={(event) => update('timezone', event.target.value)} />
          </Field>
          <Field><FieldLabel>每日 / 每周发送时间</FieldLabel>
            <Input type="time" value={preferences.daily_time.slice(0, 5)} onChange={(event) => update('daily_time', event.target.value)} />
          </Field>
          <Field><FieldLabel>每周发送日（1=周一，7=周日）</FieldLabel>
            <Input type="number" min={1} max={7} value={preferences.weekly_day} onChange={(event) => update('weekly_day', Number(event.target.value))} />
          </Field>
          <Field><FieldLabel>安静时段开始</FieldLabel>
            <Input type="time" value={(preferences.quiet_start ?? '').slice(0, 5)} onChange={(event) => update('quiet_start', event.target.value || null)} />
          </Field>
          <Field><FieldLabel>安静时段结束</FieldLabel>
            <Input type="time" value={(preferences.quiet_end ?? '').slice(0, 5)} onChange={(event) => update('quiet_end', event.target.value || null)} />
          </Field>
        </div>
        <div className="rounded-3xl border bg-muted/40 px-4 py-3">
          <p className="text-sm font-medium">Push 通知</p>
          <p className="mt-1 text-xs text-muted-foreground">暂不支持。当前不会请求设备权限，也无需配置任何密钥。</p>
        </div>
        <Button
          onClick={() => void learningApi.setNotificationPreferences({
            projectId: course.projectId,
            inAppEnabled: preferences.in_app_enabled,
            emailEnabled: preferences.email_enabled,
            timezone: preferences.timezone,
            dailyTime: preferences.daily_time.slice(0, 5),
            weeklyDay: preferences.weekly_day,
            quietStart: preferences.quiet_start ? preferences.quiet_start.slice(0, 5) : null,
            quietEnd: preferences.quiet_end ? preferences.quiet_end.slice(0, 5) : null,
          }).then(setPreferences).catch(onError)}
        >
          保存提醒偏好
        </Button>
        {deliveries.length > 0 && (
          <section className="space-y-3" aria-labelledby="delivery-history-heading">
            <h4 id="delivery-history-heading" className="font-heading text-sm font-medium">投递记录</h4>
            <div className="space-y-2">
              {deliveries.slice(0, 12).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-3xl bg-muted px-3 py-2 text-xs">
                  <a
                    className="truncate hover:underline"
                    href={item.link_path}
                    onClick={(event) => {
                      const match = item.link_path.match(/^\/conversations\/([^/?#]+)$/)
                      if (!match?.[1]) return
                      event.preventDefault()
                      selectConversation(decodeURIComponent(match[1]))
                    }}
                  >
                    {item.summary} · {DELIVERY_CHANNEL_LABELS[item.channel] ?? item.channel}
                  </a>
                  <span className="text-muted-foreground">{statusLabel(item.status)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
