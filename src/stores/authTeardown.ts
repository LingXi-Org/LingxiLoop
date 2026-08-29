type AuthTeardown = () => void

const teardowns = new Set<AuthTeardown>()

export function registerAuthTeardown(teardown: AuthTeardown): () => void {
  teardowns.add(teardown)
  return () => teardowns.delete(teardown)
}

export function runAuthTeardown(): void {
  for (const teardown of teardowns) teardown()
}
