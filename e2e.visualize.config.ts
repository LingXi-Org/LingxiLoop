import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId:'lingxiloop-issue193-visualize',
  tests:['e2e/visualize/parity.e2e.ts','e2e/visualize/lifecycle.e2e.ts','e2e/visualize/bridge.e2e.ts'],
  targets:[{name:'web',engine:web({browser:'chromium',viewport:{width:1440,height:960},locale:'zh-CN',timezoneId:'UTC',...(process.env.E2E_VISUALIZE_CDP_URL?{connect:{cdpEndpoint:()=>process.env.E2E_VISUALIZE_CDP_URL!}}:{})}),app:{url:'http://127.0.0.1:5193',readyUrl:'http://127.0.0.1:5193/__visualize_fixture/ready',command:{executable:process.execPath,args:['e2e/visualize/serve.mjs'],startupTimeout:300000,log:'.e2e/visualize-app.log'}}}],
  workers:1,retries:0,timeout:180000,assertionTimeout:45000,output:process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize',reporters:['list','junit','markdown'],
} satisfies E2EConfig
