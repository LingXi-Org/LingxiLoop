import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 5180)

export default defineConfig({
  testDir: './e2e',
  outputDir: 'artifacts/playwright',
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'vite --config e2e/vite.config.ts',
    url: `http://127.0.0.1:${port}/e2e/teacher-flow.html`,
    reuseExistingServer: !process.env.CI,
  },
})
