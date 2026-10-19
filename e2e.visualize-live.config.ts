import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId:'lingxiloop-issue193-visualize-live',tests:'e2e/visualize/live.e2e.ts',
  targets:[{name:'web',engine:web({browser:'chromium',viewport:{width:1440,height:960},locale:'zh-CN',timezoneId:'UTC'}),app:{url:'http://127.0.0.1:5195',command:{executable:process.execPath,args:['e2e/visualize/serve-live.mjs'],startupTimeout:300000}}}],
  workers:1,retries:0,timeout:240000,assertionTimeout:30000,
  output:process.env.E2E_VISUALIZE_LIVE_OUTPUT??'.e2e/visualize-live',reporters:['list','junit','markdown'],
} satisfies E2EConfig
