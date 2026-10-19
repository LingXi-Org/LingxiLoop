import {web} from '@e2e-dev/web'
import type {E2EConfig} from 'e2e'
export default {
  projectId:'lingxiloop-issue193-real-export',tests:'e2e/visualize/live-export.e2e.ts',
  targets:[{name:'web',engine:web({browser:'chromium',viewport:{width:1440,height:960},locale:'zh-CN',timezoneId:'UTC'}),app:{url:'http://127.0.0.1:5198',command:{executable:process.execPath,args:['e2e/visualize/serve-live-export.mjs'],startupTimeout:30000}}}],
  workers:1,retries:0,timeout:90000,assertionTimeout:30000,
  output:process.env.E2E_VISUALIZE_LIVE_EXPORT_OUTPUT??'.e2e/visualize-live-export',reporters:['list','junit','markdown'],
} satisfies E2EConfig
