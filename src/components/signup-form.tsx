import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function SignupForm({ busy, error, defaultInviteToken, defaultInviteKind, onSubmit, onLogin, ...props }: Omit<React.ComponentProps<typeof Card>, "onSubmit"> & {
  busy?: boolean
  error?: string | null
  defaultInviteToken?: string
  defaultInviteKind?: 'company' | 'project'
  onSubmit: (input: { name: string; email: string; password: string; inviteToken: string; inviteKind: 'company' | 'project' }) => void
  onLogin: () => void
}) {
  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>使用邀请注册</CardTitle>
        <CardDescription>
          邮箱验证后才会创建业务账号并消费邀请
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const password = String(data.get('password'))
          if (password !== String(data.get('confirmPassword'))) return
          onSubmit({ name: String(data.get('name')), email: String(data.get('email')), password, inviteToken: String(data.get('inviteToken')), inviteKind: String(data.get('inviteKind')) === 'project' ? 'project' : 'company' })
        }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">姓名</FieldLabel>
              <Input id="name" name="name" type="text" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-email">邮箱</FieldLabel>
              <Input
                id="signup-email"
                name="email"
                type="email"
                placeholder="m@example.com"
                required
              />
              <FieldDescription>
                需与定向邀请邮箱一致。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-password">密码</FieldLabel>
              <Input id="signup-password" name="password" type="password" minLength={8} required />
              <FieldDescription>
                至少 8 个字符。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                确认密码
              </FieldLabel>
              <Input id="confirm-password" name="confirmPassword" type="password" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-token">邀请 Token</FieldLabel>
              <Input id="invite-token" name="inviteToken" defaultValue={defaultInviteToken} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-kind">邀请类型</FieldLabel>
              <Input id="invite-kind" name="inviteKind" defaultValue={defaultInviteKind ?? 'company'} required />
            </Field>
            <FieldGroup>
              <Field>
                {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
                <Button type="submit" disabled={busy}>{busy ? '提交中…' : '创建账号'}</Button>
                <FieldDescription className="px-6 text-center">
                  已有账号？ <Button type="button" variant="link" className="h-auto p-0" onClick={onLogin}>登录</Button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
