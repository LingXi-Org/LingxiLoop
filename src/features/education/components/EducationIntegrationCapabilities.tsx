import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const capabilities = [
  {
    id: 'lms',
    title: 'LMS 连接器',
    description: '未来连接器会先探测能力，再将外部活动转换为标准 Learning Activity Import。',
    detail: '状态：未配置 · 当前没有运行时 Adapter',
    action: '配置 LMS',
  },
  {
    id: 'education-sso',
    title: 'Education SSO',
    description: 'LingxiIdentity 仍是唯一登录入口；未来身份 broker 只映射到 Existing User。',
    detail: '状态：未配置 · 不创建影子账号',
    action: '配置 SSO',
  },
  {
    id: 'domain-verification',
    title: '域名验证',
    description: '组织域名所有权验证将在正式提供验证服务后开放。',
    detail: '状态：未配置 · 当前不生成验证凭据',
    action: '验证域名',
  },
] as const

export function EducationIntegrationCapabilities() {
  return <section aria-labelledby="education-integrations-title" className="space-y-3">
    <div>
      <h2 id="education-integrations-title" className="text-[14px] font-semibold">外部能力</h2>
      <p className="mt-1 text-xs text-muted-foreground">这些入口仅展示规划状态，不会收集密钥或模拟配置成功。</p>
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
