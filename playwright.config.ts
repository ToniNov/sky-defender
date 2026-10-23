import { defineConfig, devices } from '@playwright/test';

// e2e-тесты: запускают dev-сервер и гоняют игру в мобильном Chromium.
// Порт свой, не 5173: тестам нужен адрес API (сам сервер подменяет page.route), а обычный `npm run dev` его не знает.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: { VITE_API_URL: 'http://api.test' },
    reuseExistingServer: true,
  },
});
