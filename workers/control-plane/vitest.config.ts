import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineWorkersConfig(async () => ({
  test: {
    include: ['workers/control-plane/src/**/*.test.ts'],
    deps: { optimizer: { ssr: { include: [
      '@modelcontextprotocol/sdk/server/mcp.js',
      '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js',
    ] } } },
    poolOptions: {
      workers: {
        wrangler: { configPath: resolve(here, 'wrangler.test.jsonc') },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations(resolve(here, 'migrations')),
            BETTER_AUTH_SECRET: 'test-better-auth-secret-that-is-long-enough',
            GATEWAY_HMAC_SECRET: 'test-gateway-secret',
            BOOTSTRAP_ADMIN_TOKEN: 'test-bootstrap-secret',
            ALIYUN_OTP_EMAIL_PASSWORD: 'test-email-password',
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
            SIGILLO_SSO_SECRET: 'test-sigillo-sso-secret',
            SIGILLO_PROVIDER_URL: 'https://sigillo-provider.example',
            MCP_SERVICE_TOKEN: 'test-mcp-service-token',
            KOMODO_API_KEY: 'test-komodo-api-key',
            KOMODO_API_SECRET: 'test-komodo-api-secret',
          },
        },
      },
    },
  },
}))
