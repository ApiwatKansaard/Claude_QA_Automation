import { Page, Locator } from '@playwright/test';
import { BasePage } from '../../base.page';

/**
 * Page Object: SharePoint KM — Agentic Chat Interface
 *
 * Covers the EkoAI chat UI for sharepoint_km tool invocation,
 * AUTH_REQUIRED signal, and document card rendering.
 *
 * Stable selectors sourced from eko-dev.ekoapp.com/agentic inspection.
 */
export class SharePointKMChatPage extends BasePage {
  // ── Root ─────────────────────────────────────────────────────────
  readonly mainContainer:  Locator;

  // ── Chat Input ───────────────────────────────────────────────────
  readonly chatInput:      Locator;
  readonly sendButton:     Locator;
  readonly attachButton:   Locator;

  // ── Chat Response ────────────────────────────────────────────────
  readonly responseMessage:    Locator;
  readonly authRequiredBlock:  Locator;
  readonly signInButton:       Locator;
  readonly sharepointXmlBlock: Locator;
  readonly documentCard:       Locator;
  readonly loadingIndicator:   Locator;
  readonly errorMessage:       Locator;

  // ── Settings / Tools ─────────────────────────────────────────────
  readonly settingsButton:  Locator;
  readonly toolTogglePanel: Locator;

  constructor(page: Page) {
    super(page);

    // Root
    this.mainContainer  = page.locator('[data-qa-anchor="main-agentic"]');

    // Chat Input
    this.chatInput      = page.locator('textarea[placeholder="Ask me anything"]');
    this.sendButton     = page.locator('button[type="submit"]');
    this.attachButton   = page.locator('button[type="file"]');

    // Chat Response — messages rendered after assistant replies
    this.responseMessage    = page.locator('[class*="ChatItem"]:last-child, [class*="Message"]:last-child').last();
    this.authRequiredBlock  = page.locator('text=auth_required, [class*="auth-required"], [class*="AuthRequired"]');
    this.signInButton       = page.locator('button:has-text("Sign in"), a:has-text("Sign in with Microsoft"), [class*="sign-in"]');
    this.sharepointXmlBlock = page.locator('[class*="sharepoint"], text=sharepoint_km, [class*="SharePoint"]');
    this.documentCard       = page.locator('[class*="document-card"], [class*="DocumentCard"], [class*="SharePointDoc"]');
    this.loadingIndicator   = page.locator('[class*="Loading"], [class*="loading"], [aria-label*="loading"]');
    this.errorMessage       = page.locator('[class*="Error"], [class*="error-message"]');

    // Settings
    this.settingsButton  = page.locator('[data-qa-anchor="appbar-settings"]');
    this.toolTogglePanel = page.locator('[class*="ToggleButton"]').first();
  }

  // ── Navigation ───────────────────────────────────────────────────

  async gotoAgentic(): Promise<void> {
    await this.page.goto('/agentic');
    await this.page.waitForLoadState('networkidle');
    await this.mainContainer.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // ── Chat Actions ─────────────────────────────────────────────────

  async sendMessage(message: string): Promise<void> {
    await this.chatInput.fill(message);
    await this.sendButton.click();
  }

  async sendMessageAndWaitForResponse(message: string, timeoutMs = 30_000): Promise<void> {
    await this.sendMessage(message);
    // Wait for loading to start then finish
    await this.page.waitForTimeout(1_000);
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(() => {
      // Loading indicator may not appear for fast responses
    });
    await this.page.waitForTimeout(500);
  }

  // ── Response Assertions ──────────────────────────────────────────

  async getLastResponseText(): Promise<string> {
    await this.page.waitForTimeout(500);
    const messages = this.page.locator('[class*="ChatItem"], [class*="Message"], [class*="chat-item"]');
    const count = await messages.count();
    if (count === 0) return '';
    return (await messages.last().innerText()) ?? '';
  }

  async responseContains(text: string, timeoutMs = 20_000): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        (t) => document.body.innerText.includes(t),
        text,
        { timeout: timeoutMs },
      );
      return true;
    } catch {
      return false;
    }
  }

  async waitForAuthRequiredBlock(timeoutMs = 20_000): Promise<void> {
    await this.page.waitForFunction(
      () => document.body.innerText.includes('auth_required') ||
            document.body.innerText.includes('Sign in') ||
            document.querySelector('[class*="auth"]') !== null,
      { timeout: timeoutMs },
    );
  }
}
