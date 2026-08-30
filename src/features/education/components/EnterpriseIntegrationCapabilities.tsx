import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const capabilities = [
  {
    id: 'scim-provisioning',
    title: 'SCIM Provisioning',
    description: '供应商和目录映射规则确定后，才会开放自动账号配置。',
    detail: '状态：不支持 · 当前仅允许手动 Membership 与 Seat 流程',
    action: '配置 SCIM',
  },
  {
    id: 'siem-sink',
    title: 'SIEM Sink',
    description: '安全事件导出将在目标 SIEM、数据范围和投递策略确定后开放。',
    detail: '状态：不支持 · 当前不会发送任何安全日志',
    action: '配置 SIEM',
  },
  {
    id: 'advanced-sso',
    title: '高级 SSO',
    description: 'LingxiIdentity 仍是唯一身份入口；高级协议不会绕过 Existing User 映射。',
    detail: '状态：不支持 · 当前不接受 IdP 凭据',
    action: '配置高级 SSO',
  },
  {
    id: 'private-deployment',
    title: '私有部署',
    description: '部署拓扑、升级责任与支持边界确定后，才会提供激活流程。',
    detail: '状态：不支持 · 当前不会创建或模拟部署',
    action: '申请私有部署',
  },
] as const

export function EnterpriseIntegrationCapabilities() {
  return <section aria-labelledby="enterprise-integrations-title" className="space-y-3">
    <div>
      <h2 id="enterprise-integrations-title" className="text-[14px] font-semibold">Enterprise 能力</h2>
      <p className="mt-1 text-[11px] text-ink-secondary">供应商未选定前，这些入口不会收集凭据、发送数据或模拟激活成功。</p>
    </div>
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {capabilities.map((capability) => <Card key={capability.id} data-capability={capability.id} className="bg-panel shadow-none">
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
