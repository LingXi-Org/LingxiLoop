import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'
// Start the isolated upstream demo server per docs/evidence/issue-302/README.md.
export default {
  projectId:'quote-candidates', tests:'e2e/quote-preview/candidates.e2e.ts',
  targets:[{name:'web', engine:web({ ...(process.env.E2E_CDP_URL ? {connect:{cdpEndpoint:()=>process.env.E2E_CDP_URL!}} : {}) }), app:{url:'http://127.0.0.1:5193'}}],
  workers:1, timeout:30000, output:'.e2e/quote-candidates', reporters:['list'],
} satisfies E2EConfig
