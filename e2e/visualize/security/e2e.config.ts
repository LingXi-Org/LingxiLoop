import { web } from '@e2e-dev/web'
import { fileURLToPath } from 'node:url'
const fixturePath = (name: string) => fileURLToPath(new URL(name, import.meta.url))
const output = fileURLToPath(new URL('../../../.e2e/visualize-security/', import.meta.url))
export default {projectId:'issue193-security-poc',tests:fixturePath('navigation.e2e.ts'),targets:[{name:'web',engine:web({browser:'chromium'}),app:{url:'http://localhost:53193',command:{executable:process.execPath,args:[fixturePath('server.mjs')],startupTimeout:30000}}}],workers:1,retries:0,timeout:30000,assertionTimeout:10000,output,reporters:['list','junit','markdown']}
