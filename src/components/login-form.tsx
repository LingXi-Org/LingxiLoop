import { cn } from "@/lib/utils"
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

export function LoginForm({
  className,
  busy,
  error,
  onSubmit,
  onSignup,
  onForgot,
  ...props
}: Omit<React.ComponentProps<"div">, "onSubmit"> & {
  busy?: boolean
  error?: string | null
  onSubmit: (email: string, password: string) => void
  onSignup: () => void
  onForgot: () => void
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>登录 LingxiLoop</CardTitle>
          <CardDescription>
            使用邮箱和密码继续
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            onSubmit(String(data.get('email')), String(data.get('password')))
          }}>
            <FieldGroup>
              <Field>
              <FieldLabel htmlFor="email">邮箱</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <Button type="button" variant="link" size="sm" className="ml-auto" onClick={onForgot}>忘记密码？</Button>
                </div>
                <Input id="password" name="password" type="password" required />
              </Field>
              <Field>
                {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
                <Button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</Button>
                <FieldDescription className="text-center">
                  没有账号？ <Button type="button" variant="link" className="h-auto p-0" onClick={onSignup}>使用邀请注册</Button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
