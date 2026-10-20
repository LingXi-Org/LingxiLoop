import base from './e2e.canvas-app.config'
export default {
  ...base,
  projectId: 'lingxiloop-canvas-app-draft-races',
  tests: ['e2e/canvas-app/draft-races.e2e.ts'],
  output: 'artifacts/canvas-app/review-races/e2e',
}
