import base from './e2e.visualize-startup.config'
export default {
  ...base,
  targets: base.targets.map(target => ({ ...target, app: { ...target.app,
    command: { ...target.app.command, args: ['--import', 'tsx', '.e2e/377-vendor/serve.mjs'],
      env: {
        E2E_VISUALIZE_RESOURCE_DELAYS: JSON.stringify({'visualize.html': 120, 'vendor/d3-7.9.0.min.js': 120}),
        ...(process.env.ISSUE377_DOCUMENT_SOURCE ? { ISSUE377_DOCUMENT_SOURCE: process.env.ISSUE377_DOCUMENT_SOURCE } : {}),
      },
    },
  } })),
  retries: 0, trace: 'off', video: 'off',
}
