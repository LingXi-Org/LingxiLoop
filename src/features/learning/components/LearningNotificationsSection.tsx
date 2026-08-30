import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
  const update = <Key extends keyof LearningNotificationPreferences>(
    key: Key,
    value: LearningNotificationPreferences[Key],
  ) => setPreferences((current) => ({ ...current, [key]: value }))

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>提醒与摘要</CardTitle>
        <CardDescription>每日聚合发送；通知正文不会包含答案、分数细节或私聊内容。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['in_app_enabled', '应用内'], ['email_enabled', '邮件'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-3xl bg-muted px-3 py-3 text-sm font-medium">
              <span>{label}</span>
              <Checkbox checked={preferences[key]} onCheckedChange={(checked) => update(key, checked === true)} />
            </label>
          ))}
          <PreferenceField label="时区">
            <Input value={preferences.timezone} onChange={(event) => update('timezone', event.target.value)} />
          </PreferenceField>
          <PreferenceField label="首选时间">
            <Input type="time" value={preferences.preferred_time.slice(0, 5)} onChange={(event) => update('preferred_time', event.target.value)} />
          </PreferenceField>
          <PreferenceField label="安静时段开始">
            <Input type="time" value={(preferences.quiet_start ?? '').slice(0, 5)} onChange={(event) => update('quiet_start', event.target.value || null)} />
          </PreferenceField>
          <PreferenceField label="安静时段结束">
            <Input type="time" value={(preferences.quiet_end ?? '').slice(0, 5)} onChange={(event) => update('quiet_end', event.target.value || null)} />
          </PreferenceField>
        </div>
        <Button
          onClick={() => void learningApi.setNotificationPreferences({
            ...(course.courseId ? { courseId: course.courseId } : {}),
            inAppEnabled: preferences.in_app_enabled,
            emailEnabled: preferences.email_enabled,
            timezone: preferences.timezone,
            preferredTime: preferences.preferred_time.slice(0, 5),
            ...(preferences.quiet_start ? { quietStart: preferences.quiet_start } : {}),
            ...(preferences.quiet_end ? { quietEnd: preferences.quiet_end } : {}),
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
                  <span>{item.kind === 'review_due' ? '复习摘要' : '待审核摘要'} · {DELIVERY_CHANNEL_LABELS[item.channel] ?? item.channel}</span>
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

function PreferenceField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>
}
