import {web} from '@e2e-dev/web'
import type {E2EConfig} from 'e2e'
import {clipboardProvider} from './e2e/visualize/clipboard-provider'
import base from './e2e.visualize.config'
export default {...base,projectId:'lingxiloop-issue193-clipboard',tests:'e2e/visualize/lifecycle.e2e.ts',targets:[{...base.targets[0],engine:web({browser:clipboardProvider,viewport:{width:1440,height:960}})}],output:'.e2e/visualize-clipboard'} satisfies E2EConfig
