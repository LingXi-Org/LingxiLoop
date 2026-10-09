import type { TestOptions } from 'e2e'

export function memberSession(role: 'member' | 'student' = 'member'): TestOptions {
  const prefix = `E2E_USER_${role.toUpperCase()}`
  return process.env[`${prefix}_USERNAME`] && process.env[`${prefix}_PASSWORD`]
    ? { session: `web-${role}` }
    : { skip: `Provide ${prefix}_USERNAME and ${prefix}_PASSWORD for a disposable local ${role} account.` }
}

export function testName(label: string): string {
  return `E2E ${label} ${crypto.randomUUID().slice(0, 8)}`
}

export const mutationPermission = process.env.E2E_MUTATIONS === '1'
  ? {}
  : { skip: 'Set E2E_MUTATIONS=1 only for a disposable test workspace.' }
