import { test as setup, expect } from '@playwright/test';
import { loadEnvConfig } from '../src/config/env.config';

const config = loadEnvConfig();

setup('authenticate', async ({ page }) => {
  const { adminEmail, adminPassword, loginMethod, ssoProviderURL, authStatePath } = config;

  await page.goto('/login');

  if (loginMethod === 'cognito' || loginMethod === 'basic') {
    // Standard form login (Cognito hosted UI or basic username/password)
    await page.locator('#username').fill(adminEmail);
    await page.locator('#password').fill(adminPassword);
    await page.getByTestId('test-login-btn').click();
  } else if (loginMethod === 'sso') {
    // SSO — click SSO button, handle redirect to IdP
    await page.locator('button:has-text("SSO"), a:has-text("SSO"), button:has-text("Sign in with SSO")').click();
    await page.waitForURL(`**/${new URL(ssoProviderURL).hostname}/**`, { timeout: 15_000 });
    // Fill SSO provider form (adjust selectors per provider)
    await page.locator('input[type="email"], input[name="email"], #username').fill(adminEmail);
    await page.locator('input[type="password"], input[name="password"]').fill(adminPassword);
    await page.locator('button[type="submit"]').click();
  }

  // After login the app redirects to /
  await page.waitForURL('**/', { timeout: 30_000 });
  await expect(page).not.toHaveURL(/.*login.*/);

  // Save auth state per environment (staging-user.json, dev-user.json, etc.)
  await page.context().storageState({ path: authStatePath });
});
