import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function SubscriptionUnavailableCard() {
  return <Card data-capability="personal-plus" className="bg-cloud shadow-none">
    <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Personal Plus</CardTitle><Badge variant="secondary">暂未开放</Badge></div><CardDescription>订阅核心已准备好，但尚未选择支付服务商。当前不会收集支付信息，也不会模拟升级成功。</CardDescription></CardHeader>
    <CardContent className="text-xs text-muted-foreground">价格、额度与试验资格将在正式上线时由 Plan Entitlement 和配置提供。</CardContent>
    <CardFooter className="flex flex-wrap gap-2"><Button disabled>自助升级</Button><Button variant="outline" disabled>续费</Button><Button variant="outline" disabled>支付管理</Button></CardFooter>
  </Card>
}
