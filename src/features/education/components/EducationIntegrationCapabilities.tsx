import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const capabilities = [
  {
    id: 'lms',
    title: '教学平台连接',
    description: '连接开放后，可将外部教学活动导入课程。',
    detail: '当前尚未连接外部教学平台',
    action: '配置教学平台',
  },
  {
    id: 'education-sso',
    title: '教育单点登录',
    description: '连接开放后，可使用学校现有账号安全登录。',
    detail: '当前不会额外创建重复账号',
    action: '配置单点登录',
  },
  {
    id: 'domain-verification',
    title: '域名验证',
    description: '组织域名所有权验证将在正式提供验证服务后开放。',
    detail: '当前不会生成验证信息',
    action: '验证域名',
  },
] as const

export function EducationIntegrationCapabilities() {
  return <section aria-labelledby="education-integrations-title" className="space-y-3">
    <div>
      <h2 id="education-integrations-title" className="text-[14px] font-semibold">外部能力</h2>
      <p className="mt-1 text-xs text-muted-foreground">这些服务开放前，不会收集密钥或显示虚假的配置结果。</p>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {capabilities.map((capability) => <Card key={capability.id} data-capability={capability.id}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3"><CardTitle>{capability.title}</CardTitle><Badge variant="secondary">暂未开放</Badge></div>
          <CardDescription>{capability.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{capability.detail}</CardContent>
        <CardFooter><Button type="button" variant="outline" disabled>{capability.action}</Button></CardFooter>
      </Card>)}
    </div>
  </section>
}
