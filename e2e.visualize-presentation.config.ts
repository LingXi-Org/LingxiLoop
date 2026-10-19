import type {E2EConfig} from 'e2e'
import base from './e2e.visualize.config'
export default {...base,projectId:'lingxiloop-issue193-Web-presentation',tests:'e2e/visualize/presentation.e2e.ts',output:process.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize-web-final'} satisfies E2EConfig
