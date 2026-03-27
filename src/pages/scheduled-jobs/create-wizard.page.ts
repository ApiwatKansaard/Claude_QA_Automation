import { BasePage } from '../base.page';
import type { Page, Locator } from '@playwright/test';

/**
 * CreateWizardPage — selectors for the Create Scheduler wizard.
 * Selectors sourced from selectors/scheduled-jobs.json (createScheduler section).
 */
export class CreateWizardPage extends BasePage {
  readonly cancelButton: Locator;
  readonly nextButton: Locator;
  readonly schedulerNameInput: Locator;
  readonly descriptionInput: Locator;
  readonly scheduleTimeInput: Locator;
  readonly webhookUrlInput: Locator;
  readonly timeoutInput: Locator;
  readonly apiKeyInput: Locator;
  readonly runTimeImmediateRadio: Locator;
  readonly runTimeScheduledRadio: Locator;

  constructor(page: Page) {
    super(page);

    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.nextButton = page.getByRole('button', { name: 'Next' });
    this.schedulerNameInput = page.getByPlaceholder('Enter scheduler name');
    this.descriptionInput = page.getByPlaceholder('Enter description');
    this.scheduleTimeInput = page.getByPlaceholder('00:00').first();
    this.webhookUrlInput = page.getByPlaceholder('Enter webhook URL');
    this.timeoutInput = page.getByPlaceholder('00 : 00 : 00');
    this.apiKeyInput = page.getByPlaceholder('Enter API Key');
    this.runTimeImmediateRadio = page
      .locator('label')
      .filter({ hasText: 'As soon as the response is ready' })
      .locator('input[type="radio"]');
    this.runTimeScheduledRadio = page
      .locator('label')
      .filter({ hasText: 'Set time' })
      .locator('input[type="radio"]');
  }

  async goto(): Promise<void> {
    await this.navigate('/ai-task-scheduler/ai-task-scheduler/create');
  }

  async fillBasicInfo(name: string, description?: string): Promise<void> {
    await this.schedulerNameInput.fill(name);
    if (description) {
      await this.descriptionInput.fill(description);
    }
  }

  async fillProcessEndpoint(url: string, apiKey: string): Promise<void> {
    await this.webhookUrlInput.fill(url);
    await this.apiKeyInput.fill(apiKey);
  }

  async clickNext(): Promise<void> {
    await this.nextButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickCancel(): Promise<void> {
    await this.cancelButton.click();
  }

  async selectRunTimeImmediate(): Promise<void> {
    await this.runTimeImmediateRadio.check();
  }

  async selectRunTimeScheduled(): Promise<void> {
    await this.runTimeScheduledRadio.check();
  }
}
