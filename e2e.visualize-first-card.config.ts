import type { E2EConfig } from 'e2e'
import base from './e2e.visualize.config'
export default { ...base, tests: 'e2e/visualize/first-card.e2e.ts',
  targets: base.targets.map(target => ({ ...target, app: { ...target.app, command: { ...target.app.command,
    env: { E2E_VISUALIZE_RESOURCE_DELAYS: JSON.stringify({
      'gen-ui.js': 1200, 'visualize.html': 40, 'visualize.css': 40, 'calendar.js': 40,
      'vendor/d3-7.9.0.min.js': 500, 'vendor/floating-ui-core-1.7.3.min.js': 500,
      'vendor/floating-ui-dom-1.7.4.min.js': 500, 'vendor/lucide-1.17.0.js': 500,
      ...(process.env.E2E_VISUALIZE_SLOW_KIT ? { 'visualize.html': 1200, 'gen-ui.js': 40 } : {}),
    }) },
  } } })), output: process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-first-card',
} satisfies E2EConfig
