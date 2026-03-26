import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig, resolveEnv } from './src/config/env.config';

const env = resolveEnv();
const config = loadEnvConfig(env);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: `reports/${env}/html`, open: 'always' }],
    ['json', { outputFile: `reports/${env}/results.json` }],
    ['junit', { outputFile: `reports/${env}/junit.xml` }],
  ],

  use: {
    baseURL: config.baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // --- Setup (auth per environment) ---
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // --- E2E Tests (UI) ---
    {
      name: 'e2e',
      testDir: './tests/e2e',
      testMatch: /[\/]tests[\/]e2e[\/].+[\/].*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: config.authStatePath,
      },
    },

    // --- API Tests ---
    {
      name: 'api',
      testDir: './tests/api',
      testMatch: /[\/]tests[\/]api[\/].+[\/].*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
        },
      },
    },

    // --- Mobile Tests (disabled — enable with: npx playwright test --project=mobile) ---
    // {
    //   name: 'mobile',
    //   testDir: './tests/e2e',
    //   testMatch: /[\/]tests[\/]e2e[\/].+[\/].*\.spec\.ts$/,
    //   dependencies: ['setup'],
    //   use: {
    //     ...devices['iPhone 14'],
    //     storageState: config.authStatePath,
    //   },
    // },

    // --- Cross-browser (disabled — enable with: npx playwright test --project=firefox) ---
    // {
    //   name: 'firefox',
    //   testDir: './tests/e2e',
    //   testMatch: /[\/]tests[\/]e2e[\/].+[\/].*\.spec\.ts$/,
    //   dependencies: ['setup'],
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     storageState: config.authStatePath,
    //   },
    // },
  ],

  outputDir: 'test-results/',
});
