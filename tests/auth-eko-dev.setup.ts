/**
 * Auth Setup for eko-dev / MITY
 *
 * Login page: https://eko-dev.ekoapp.com/login
 * Fields (confirmed from live DOM):
 *   Username: #username
 *   Password: //input inside form div[2]/div[2]
 *   Region:   "Southeast Asia" (pre-selected)
 *   Log in:   green button in form
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_STATE_PATH = path.resolve(__dirname, '../playwright/.auth/eko-dev-user.json');

setup('authenticate on eko-dev', async ({ page }) => {
  const email = process.env.ADMIN_EMAIL || 'apiwat@amitysolutions.com';
  const password = process.env.ADMIN_PASSWORD || '';

  await page.goto('https://eko-dev.ekoapp.com/login');
  await page.waitForLoadState('networkidle');

  // Username
  const usernameInput = page.locator('#username');
  await expect(usernameInput).toBeVisible({ timeout: 15_000 });
  await usernameInput.fill(email);

  // Password (input inside the password form field)
  const passwordInput = page.locator('input[type="password"]')
    .or(page.locator('xpath=/html/body/div/div[1]/div/div/form/div[2]/div[2]/div/div/span/input'));
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await passwordInput.fill(password);

  // Region should already be "Southeast Asia" — no change needed

  // Click Log in button
  const loginBtn = page.getByRole('button', { name: /log in/i })
    .or(page.locator('xpath=/html/body/div/div[1]/div/div/form/div[2]/div[6]/div/div/button'));
  await loginBtn.click();

  // Wait for login to complete (redirects to home page)
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  // Navigate to Agentic AI
  await page.goto('https://eko-dev.ekoapp.com/agentic');
  await page.waitForLoadState('networkidle');

  // Verify logged in — Agentic AI page with New Chat link
  await expect(page.getByRole('link', { name: 'New Chat' })).toBeVisible({ timeout: 15_000 });

  // Save auth state
  await page.context().storageState({ path: AUTH_STATE_PATH });
  console.log(`✅ Auth state saved: ${AUTH_STATE_PATH}`);
});
