import type { E2EConfig } from 'e2e'
import base from './e2e.question-index.config'
export default { ...base, projectId:'lingxiloop-quote-preview', tests:'e2e/quote-preview/browser.e2e.ts', output:'.e2e/quote-preview' } satisfies E2EConfig
