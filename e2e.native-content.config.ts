import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
const cdpEndpoint = process.env.E2E_CDP_URL
export default {projectId:'lingxiloop-native-content',tests:'e2e/content-editor/browser.e2e.ts',
  targets:[{name:'native',engine:web({browser:'chromium',viewport:{width:1440,height:1000},locale:'zh-CN',
    ...(cdpEndpoint ? { connect: { cdpEndpoint: () => cdpEndpoint } } : {})}),app:{url:'http://127.0.0.1:53109'}}],
  workers:1,retries:0,timeout:120000,assertionTimeout:15000,trace:'retain-on-failure',output:'artifacts/issue-219/native',reporters:['list','junit','markdown'],failOnSkippedFailure:true,
} satisfies E2EConfig
