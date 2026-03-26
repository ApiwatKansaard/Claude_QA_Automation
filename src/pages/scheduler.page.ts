import { BasePage } from './base.page';
import type { Page, Locator } from '@playwright/test';

export class SchedulerPage extends BasePage {
  // Page header
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;
  readonly createButton: Locator;

  // Filters & search
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly statusDropdown: Locator;
  readonly sortDropdown: Locator;

  // Job list
  readonly jobCards: Locator;

  // Stats cards
  readonly statsCards: Locator;

  // Pagination
  readonly paginationButtons: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.pageTitle = page.locator('span:has-text("AI Task Scheduler")').first();
    this.pageSubtitle = page.locator('span:has-text("Manage automated AI agents")');
    this.createButton = page.locator('button:has-text("Create New Scheduler")');

    // Filters
    this.searchInput = page.locator('input[placeholder="Search"]');
    this.searchButton = page.locator('button:has-text("Search")');
    this.statusDropdown = page.getByTestId('antd-select').first();
    this.sortDropdown = page.getByTestId('antd-select').nth(1);

    // Job list — each job is a link to /ai-task-scheduler/management/:id
    this.jobCards = page.locator('a[href^="/ai-task-scheduler/management/"]');

    // Stats cards at top
    this.statsCards = page.locator('.rounded-xl.bg-blue-50, .rounded-xl.bg-green-50, .rounded-xl.bg-red-50');

    // Pagination
    this.paginationButtons = page.locator('button:has-text(/^\\d+$/)');
  }

  async goto(): Promise<void> {
    await this.navigate('/ai-task-scheduler');
  }

  async getJobCount(): Promise<number> {
    return this.jobCards.count();
  }

  async getJobNames(): Promise<string[]> {
    const cards = await this.jobCards.all();
    const names: string[] = [];
    for (const card of cards) {
      const text = await card.textContent();
      // Job name is the first line before "Last run:"
      const name = text?.split('Last run:')[0]?.trim() ?? '';
      names.push(name);
    }
    return names;
  }

  async clickJob(index: number): Promise<void> {
    await this.jobCards.nth(index).click();
  }

  getJobToggle(index: number): Locator {
    // Each job card is followed by a switch and delete button
    return this.page.locator('[role="switch"]').nth(index);
  }

  async searchJobs(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async filterByStatus(status: string): Promise<void> {
    await this.statusDropdown.click();
    await this.page.locator(`.ant-select-item-option:has-text("${status}")`).click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickCreateNew(): Promise<void> {
    await this.createButton.click();
    await this.page.waitForURL('**/create**', { timeout: 15_000 });
  }
}
