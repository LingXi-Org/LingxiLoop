export type AuthTeardownReason = 'session-rejected' | undefined
type AuthTeardown = (reason: AuthTeardownReason) => void

const teardowns = new Set<AuthTeardown>()

export function registerAuthTeardown(teardown: AuthTeardown): () => void {
  teardowns.add(teardown)
  return () => teardowns.delete(teardown)
}

export function runAuthTeardown(reason?: AuthTeardownReason): void {
  for (const teardown of teardowns) teardown(reason)
}
