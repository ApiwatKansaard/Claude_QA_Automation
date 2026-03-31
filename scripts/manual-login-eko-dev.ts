/**
 * Manual Login Script for eko-dev
 * Opens a Playwright browser → you login manually → saves auth state
 *
 * Usage: npx ts-node scripts/manual-login-eko-dev.ts
 */
import { chromium } from 'playwright';
import path from 'path';

const AUTH_STATE_PATH = path.resolve(__dirname, '../playwright/.auth/eko-dev-user.json');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://eko-dev.ekoapp.com');

  console.log('\n========================================');
  console.log('🔐 Please login manually in the browser');
  console.log('   After you see the chat interface,');
  console.log('   press Enter here to save session...');
  console.log('========================================\n');

  // Wait for user to press Enter
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  // Save auth state
  await context.storageState({ path: AUTH_STATE_PATH });
  console.log(`\n✅ Auth state saved: ${AUTH_STATE_PATH}`);

  await browser.close();
  process.exit(0);
})();
