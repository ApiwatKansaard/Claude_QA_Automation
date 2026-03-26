import { BasePage } from './base.page';
import type { Page, Locator } from '@playwright/test';

export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('#password');
    this.loginButton = page.getByTestId('test-login-btn');
    this.errorMessage = page.locator('[role="alert"], .ant-form-item-explain-error');
    this.forgotPasswordLink = page.locator('a:has-text("Forgot password?")');
  }

  async goto(): Promise<void> {
    await this.navigate('/login');
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    // After login, app redirects to / (Usage Dashboard)
    await this.page.waitForURL('**/', { timeout: 30_000 });
  }

  async getErrorMessage(): Promise<string> {
    return this.getText(this.errorMessage);
  }
}
