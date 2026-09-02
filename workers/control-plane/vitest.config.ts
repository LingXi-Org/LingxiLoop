import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineWorkersConfig(async () => ({
  test: {
    include: ['workers/control-plane/src/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: resolve(here, 'wrangler.test.jsonc') },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations(resolve(here, 'migrations')),
            BETTER_AUTH_SECRET: 'test-better-auth-secret-that-is-long-enough',
            GATEWAY_HMAC_SECRET: 'test-gateway-secret',
            RELEASE_HMAC_SECRET: 'test-release-secret',
            BOOTSTRAP_ADMIN_TOKEN: 'test-bootstrap-secret',
            OPENSHIP_PAT: 'test-openship-pat',
            OPENSHIP_PROJECT_IDS: 'proj_test-a,proj_test-b',
            RESEND_API_KEY: 'test-resend-key',
            RESEND_FROM: 'LingxiLoop <test@example.com>',
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
          },
        },
      },
    },
  },
}))
