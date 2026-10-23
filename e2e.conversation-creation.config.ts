import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
export default {
  projectId:'lingxiloop-issue327',tests:'e2e/conversation-creation/*.e2e.ts',
  targets:[{name:'desktop',engine:web({browser:'chromium',viewport:{width:1280,height:900},locale:'zh-CN',...(process.env.E2E_CDP_URL ? {connect:{cdpEndpoint:()=>process.env.E2E_CDP_URL!}} : {})}),
    app:{url:'http://127.0.0.1:53227',command:{executable:process.execPath,args:['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','53227','--strictPort'],startupTimeout:120000,log:'.e2e/issue327/app.log'}}}],
  workers:1,retries:0,timeout:60000,assertionTimeout:15000,trace:'retain-on-failure',output:'.e2e/issue327',reporters:['list','junit','markdown'],failOnSkippedFailure:true,
} satisfies E2EConfig
