import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const capabilities = [
  {
    id: 'scim-provisioning',
    title: '自动配置账号',
    description: '账号目录连接准备完成后，可自动为成员开通访问权。',
    detail: '当前仅支持手动添加成员',
    action: '配置账号目录',
  },
  {
    id: 'siem-sink',
    title: '安全日志导出',
    description: '安全日志服务准备完成后，可将指定事件发送到外部平台。',
    detail: '当前不会向外部发送安全日志',
    action: '配置日志导出',
  },
  {
    id: 'advanced-sso',
    title: '企业单点登录',
    description: '企业身份连接准备完成后，可使用已有账号安全登录。',
    detail: '当前不接收企业身份服务的密钥',
    action: '配置单点登录',
  },
  {
    id: 'private-deployment',
    title: '私有部署',
    description: '部署拓扑、升级责任与支持边界确定后，才会提供激活流程。',
    detail: '当前不会创建或模拟私有部署',
    action: '申请私有部署',
  },
] as const

export function EnterpriseIntegrationCapabilities() {
  return <section aria-labelledby="enterprise-integrations-title" className="space-y-3">
    <div>
      <h2 id="enterprise-integrations-title" className="text-[14px] font-semibold">企业版能力</h2>
      <p className="mt-1 text-xs text-muted-foreground">这些服务开放前，不会收集密钥、发送数据或显示虚假的开通结果。</p>
    </div>
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {capabilities.map((capability) => <Card key={capability.id} data-capability={capability.id}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3"><CardTitle>{capability.title}</CardTitle><Badge variant="secondary">暂不支持</Badge></div>
          <CardDescription>{capability.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{capability.detail}</CardContent>
        <CardFooter><Button type="button" variant="outline" disabled>{capability.action}</Button></CardFooter>
      </Card>)}
    </div>
  </section>
}
