import { BasePage } from '../base.page';
import type { Page, Locator } from '@playwright/test';

/**
 * HistoryLogsPage — selectors for the History Log tab on the management page.
 * Selectors sourced from selectors/scheduled-jobs.json (historyLog section).
 */
export class HistoryLogsPage extends BasePage {
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly sortDropdown: Locator;
  readonly historyTable: Locator;
  readonly historyRow: Locator;
  readonly audienceCountButton: Locator;
  readonly paginationPrev: Locator;
  readonly paginationNext: Locator;

  constructor(page: Page) {
    super(page);

    this.searchInput = page.getByPlaceholder('Search');
    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.sortDropdown = page.getByText('Last update');
    this.historyTable = page.getByRole('table').first();
    this.historyRow = page.getByRole('table').nth(1);
    this.audienceCountButton = page.getByRole('button', { name: /audiences/ });
    this.paginationPrev = page
      .locator('button')
      .filter({ has: page.locator('img[alt="left"]') });
    this.paginationNext = page
      .locator('button')
      .filter({ has: page.locator('img[alt="right"]') });
  }

  async gotoHistoryTab(jobId: string): Promise<void> {
    await this.navigate(`/ai-task-scheduler/management/${jobId}?tab=history_log`);
  }

  async searchHistory(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async getHistoryRowCount(): Promise<number> {
    const table = this.page.getByRole('table').nth(1);
    const rows = table.locator('tr');
    return rows.count();
  }

  async clickFirstHistoryRow(): Promise<void> {
    await this.historyRow.locator('tr').first().click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickAudienceCount(): Promise<void> {
    await this.audienceCountButton.first().click();
    await this.page.waitForLoadState('networkidle');
  }

  async goToNextPage(): Promise<void> {
    await this.paginationNext.click();
    await this.page.waitForLoadState('networkidle');
  }

  async goToPrevPage(): Promise<void> {
    await this.paginationPrev.click();
    await this.page.waitForLoadState('networkidle');
  }
}
