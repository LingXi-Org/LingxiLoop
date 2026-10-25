import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

export default {
  projectId: 'lingxiloop-case-authoring-covers-449', tests: 'e2e/cases/authoring-covers.e2e.ts',
  targets: [{ name: 'case-authoring-cover', engine: web({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    connect: { cdpEndpoint: () => {
      if (!process.env.E2E_AUTHORING_COVER_CDP_URL) throw Error('Normal-sandbox fixture CDP endpoint is required')
      return process.env.E2E_AUTHORING_COVER_CDP_URL
    } },
  }), app: { url: 'http://127.0.0.1:53108' } }],
  workers: 1, retries: 0, timeout: 180_000, assertionTimeout: 12_000,
  failOnSkippedFailure: true, trace: 'on', video: 'on', output: 'artifacts/issue-449/browser', reporters: ['list', 'junit', 'markdown'],
} satisfies E2EConfig
