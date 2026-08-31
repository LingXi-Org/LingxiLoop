import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function SubscriptionUnavailableCard() {
  return <Card data-capability="personal-plus" className="bg-cloud shadow-none">
    <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>个人增强版</CardTitle><Badge variant="secondary">暂未开放</Badge></div><CardDescription>订阅服务还在准备中，目前不会收集任何支付信息。</CardDescription></CardHeader>
    <CardContent className="text-xs text-muted-foreground">正式开放后，这里会显示价格、可用额度和升级方式。</CardContent>
    <CardFooter className="flex flex-wrap gap-2"><Button disabled>自助升级</Button><Button variant="outline" disabled>续费</Button><Button variant="outline" disabled>支付管理</Button></CardFooter>
  </Card>
}
