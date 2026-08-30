import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'artifacts/playwright',
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'vite --config e2e/vite.config.ts',
    url: 'http://127.0.0.1:5180/e2e/teacher-flow.html',
    reuseExistingServer: !process.env.CI,
  },
})
