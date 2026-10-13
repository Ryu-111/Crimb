import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  // ソフトウェア WebGL 上の姿勢推定は重いので直列実行
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    // iPhone の画面サイズ・タッチ操作を Chromium でエミュレート
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
})
