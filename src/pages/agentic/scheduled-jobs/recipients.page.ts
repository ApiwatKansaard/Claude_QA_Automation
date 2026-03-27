import { BasePage } from '../../base.page';
import type { Page, Locator } from '@playwright/test';

/**
 * RecipientsPage — selectors for the Audience/Recipients tab on the management page.
 * Selectors sourced from selectors/scheduled-jobs.json (audience section).
 */
export class RecipientsPage extends BasePage {
  readonly sectionHeading: Locator;
  readonly updateAudienceButton: Locator;
  readonly totalAudiencesLabel: Locator;
  readonly individualUsersSection: Locator;
  readonly individualSearchInput: Locator;
  readonly userCheckbox: Locator;
  readonly selectedCountBadge: Locator;
  readonly directoryGroupsSection: Locator;
  readonly directorySearchInput: Locator;

  constructor(page: Page) {
    super(page);

    // Content area heading — unique to audience tab (avoids matching the tab button)
    this.sectionHeading = page.locator('span').filter({ hasText: /^Audience$/ }).first();
    this.updateAudienceButton = page.getByRole('button', { name: 'Update Audience' });
    this.totalAudiencesLabel = page.getByText('Total :');
    this.individualUsersSection = page.getByText('Select Individual Users');
    this.individualSearchInput = page.getByPlaceholder('Search').first();
    this.userCheckbox = page.locator('label input[type="checkbox"]').first();
    this.selectedCountBadge = page.getByText(/ selected/);
    this.directoryGroupsSection = page.getByText('Select Directory Groups');
    this.directorySearchInput = page.getByPlaceholder('Search').nth(1);
  }

  async gotoAudienceTab(jobId: string): Promise<void> {
    await this.navigate(`/ai-task-scheduler/management/${jobId}?tab=audience`);
  }

  async clickUpdateAudience(): Promise<void> {
    const isEnabled = await this.updateAudienceButton.isEnabled().catch(() => false);
    if (!isEnabled) return;
    await this.updateAudienceButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async searchIndividualUser(query: string): Promise<void> {
    await this.individualSearchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  async searchDirectoryGroup(query: string): Promise<void> {
    await this.directorySearchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  async selectFirstUser(): Promise<void> {
    await this.userCheckbox.check();
  }

  async getSelectedCount(): Promise<string> {
    return this.getText(this.selectedCountBadge);
  }
}
