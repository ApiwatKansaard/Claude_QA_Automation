import { test as base, expect, type Page, type Locator } from '@playwright/test';

/**
 * Base Page Object — all page objects extend this class.
 * Provides common navigation, waiting, and assertion helpers.
 */
export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to a relative path (appended to baseURL from config) */
  async navigate(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'networkidle' });
  }

  /** Wait for a specific element to be visible */
  async waitForElement(locator: Locator, timeout = 10_000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }

  /** Get text content of an element, trimmed */
  async getText(locator: Locator): Promise<string> {
    const text = await locator.textContent();
    return text?.trim() ?? '';
  }

  /** Check if an element exists on the page (does not wait) */
  async isVisible(locator: Locator): Promise<boolean> {
    return locator.isVisible();
  }

  /** Take a screenshot for debugging */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `reports/screenshots/${name}.png`, fullPage: true });
  }

  /** Wait for network to be idle (useful after form submissions) */
  async waitForNetworkIdle(timeout = 5_000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /** Wait for a toast notification and return its text */
  async waitForToast(): Promise<string> {
    const toast = this.page.locator('[role="alert"], .toast, .notification').first();
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    return this.getText(toast);
  }
}
