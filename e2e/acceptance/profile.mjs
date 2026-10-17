// Fixed disposable endpoints only. Never accept an arbitrary database/container.
const selection = process.env.E2E_SPA_ISOLATED
if (selection !== undefined && selection !== '1') throw new Error('E2E_SPA_ISOLATED must be unset or 1')
export const isolatedSpa = selection === '1' ? {
  origin: 'http://127.0.0.1:5280', apiPort: 5281, supervisorPort: 5285, controlPort: 8897,
  databasePort: '55433', databaseContainer: 'lingxiloop-spa352-postgres-1',
  controlState: '.e2e/spa352-control-state', controlConfig: 'e2e/acceptance/wrangler.jsonc',
  env: {
    E2E_SPA_ISOLATED: '1', PORT: '5281',
    DATABASE_URL: 'postgres://postgres:lingxiloop-e2e-local@127.0.0.1:55433/lingxiloop_browser_test',
    REDIS_URL: 'redis://127.0.0.1:56380/1', CONTROL_PLANE_BASE_URL: 'http://127.0.0.1:8897',
    LINGXILOOP_PUBLIC_ORIGIN: 'http://127.0.0.1:5280', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5280',
    WUKONG_API_URL: 'http://127.0.0.1:55002', WUKONG_WS_URL: 'ws://127.0.0.1:55201',
    R2_ENDPOINT: 'http://127.0.0.1:59001', R2_PUBLIC_BASE: 'http://127.0.0.1:59001/lingxiloop-e2e',
    LINGXIOS_CONTROL_PORT: '5282', LINGXIOS_CONTROL_URL: 'http://127.0.0.1:5282',
    AGENT_OS_HOMES_ROOT: '.e2e/spa352-runtime-homes',
  },
} : null
