import { defineConfig, devices } from '@playwright/test';

// Tests run against the built site in dist/ (python3 tools/build_web.py --only all), served under /bolchaal-hindi/ like GitHub Pages.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8788/bolchaal-hindi/', // same subpath as GitHub Pages
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: { command: 'python3 tools/serve.py 8788 dist /bolchaal-hindi', url: 'http://localhost:8788/bolchaal-hindi/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'laptop', use: { viewport: { width: 1366, height: 860 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
