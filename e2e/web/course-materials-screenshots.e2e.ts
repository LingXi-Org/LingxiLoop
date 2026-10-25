import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Official e2e security documentation permits genuine cookie-based login for
// screenshot attempts. These sessions are obtained from the actual auth endpoint
// with a real rendered Turnstile token. UI-password sessions remain protected;
// no existing session files or secret provenance are changed.
for (const [role, space] of [['member', 'public'], ['student', 'public'], ['student', 'private']] as const) {
  test(`course materials screenshot ${role} ${space}`, {
    skip: process.env.E2E_COURSE_MATERIALS !== '1', tags: ['web', 'course-materials', 'screenshots'], timeout: 90_000,
  }, async ({ app, browser, screen }) => {
    const origin = 'http://127.0.0.1:5180'
    if (process.env.E2E_BASE_URL && process.env.E2E_BASE_URL !== origin) throw new Error('Screenshots require the fixed disposable local environment')
    // Preserve the active limiter and let its natural sign-in window expire.
    await new Promise(resolve => setTimeout(resolve, 11_000))
    await app.open('/')
    await expect.poll(() => browser.evaluate(() => Boolean(document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value)), { timeout: 45_000 }).toBe(true)
    const captcha = await browser.evaluate(() => document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')!.value)
    const response = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-captcha-response': captcha },
      body: JSON.stringify({ email: process.env[`E2E_USER_${role.toUpperCase()}_USERNAME`], password: process.env[`E2E_USER_${role.toUpperCase()}_PASSWORD`] }),
    })
    if (!response.ok) throw new Error(`Real screenshot login failed: HTTP ${response.status}`)
    const cookies = response.headers.getSetCookie().map(header => {
      const pair = header.split(';')[0]
      const separator = pair.indexOf('=')
      return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: origin, httpOnly: /;\s*httponly/i.test(header), secure: /;\s*secure/i.test(header), sameSite: 'Lax' as const }
    })
    if (!cookies.length) throw new Error('Real authentication returned no session cookie')
    await browser.setCookies(cookies)
    await browser.evaluate(() => { localStorage.setItem('lingxiloop-theme', 'light'); return null })
    await app.open('/?project=e2e-classroom&view=course-materials')
    await expect(screen.getByRole('heading', '课程资料', { level: 1 })).toBeVisible()
    if (space === 'private') await screen.getByRole('tab', '我的资料').tap()
    await expect.poll(() => browser.evaluate(() => document.querySelector('[data-course-materials] [aria-busy="true"]') === null)).toBe(true)
    await expect(screen.getByRole('table', '课程资料列表')).toBeVisible()
    await app.screenshot(`course-materials-${role === 'member' ? 'teacher' : 'student'}-${space}`)
  })
}
