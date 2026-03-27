import { BasePage } from '../base.page';
import type { Page, Locator } from '@playwright/test';

/**
 * JobConfigPage — selectors for the Job Configuration tab on the management page.
 * Selectors sourced from selectors/scheduled-jobs.json (jobConfiguration section).
 */
export class JobConfigPage extends BasePage {
  readonly tabJobConfig: Locator;
  readonly tabAudience: Locator;
  readonly tabHistoryLog: Locator;
  readonly pageHeading: Locator;
  readonly backToDashboardLink: Locator;
  readonly saveButton: Locator;
  readonly schedulerNameInput: Locator;
  readonly descriptionInput: Locator;
  readonly repeatDropdown: Locator;
  readonly scheduleTimeInput: Locator;
  readonly webhookUrlInput: Locator;
  readonly timeoutInput: Locator;
  readonly apiKeyInput: Locator;
  readonly actionDropdown: Locator;
  readonly runTimeImmediateRadio: Locator;
  readonly runTimeScheduledRadio: Locator;
  readonly actionTimeInput: Locator;

  constructor(page: Page) {
    super(page);

    this.tabJobConfig = page.getByRole('button', { name: 'Job Configuration' });
    this.tabAudience = page.getByRole('button', { name: 'Audience' });
    this.tabHistoryLog = page.getByRole('button', { name: 'History Log' });
    this.pageHeading = page.getByText('Edit Scheduler');
    this.backToDashboardLink = page.locator("a[href='/ai-task-scheduler']").last();
    this.saveButton = page.getByRole('button', { name: 'Save change' });
    this.schedulerNameInput = page.getByPlaceholder('Enter scheduler name');
    this.descriptionInput = page.getByPlaceholder('Enter description');
    this.repeatDropdown = page.getByText('Daily');
    this.scheduleTimeInput = page.getByPlaceholder('00:00').first();
    this.webhookUrlInput = page.getByPlaceholder('Enter webhook URL');
    this.timeoutInput = page.getByPlaceholder('00 : 00 : 00');
    this.apiKeyInput = page.getByPlaceholder('Enter API Key');
    this.actionDropdown = page.getByText('Home page');
    this.runTimeImmediateRadio = page.getByRole('radio', { name: 'IMMEDIATE' });
    this.runTimeScheduledRadio = page.getByRole('radio', { name: 'SCHEDULED' });
    this.actionTimeInput = page.getByPlaceholder('00:00').nth(1);
  }

  async gotoJob(jobId: string): Promise<void> {
    await this.navigate(`/ai-task-scheduler/management/${jobId}`);
  }

  async clickJobConfigTab(): Promise<void> {
    await this.tabJobConfig.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickAudienceTab(): Promise<void> {
    await this.tabAudience.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickHistoryLogTab(): Promise<void> {
    await this.tabHistoryLog.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickSave(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async updateSchedulerName(name: string): Promise<void> {
    await this.schedulerNameInput.fill(name);
  }

  async clickBackToDashboard(): Promise<void> {
    await this.backToDashboardLink.click();
    await this.page.waitForURL('**/ai-task-scheduler', { timeout: 10_000 });
  }
}
