/**
 * UI Test: AI Task Scheduler — List Page
 *
 * Maps to TestRail: "Agentic > Scheduled Jobs > Dashboard"
 * Test Case: "Check scheduled jobs list should be displayed on Dashboard page"
 * Type: Smoke Test | Priority: P1 | Platform: Web
 */
import { test, expect } from '../../fixtures';

test.describe('AI Task Scheduler — List Page', { tag: ['@scheduled-jobs'] }, () => {
  test.beforeEach(async ({ schedulerPage }) => {
    await schedulerPage.goto();
  });

  test('TC-DASH-001: scheduled jobs list should be displayed',
    { tag: ['@smoke', '@P1'] },
    async ({ schedulerPage, page }) => {
    // 1. Page title and subtitle are visible
    await expect(schedulerPage.pageTitle).toBeVisible();
    await expect(schedulerPage.pageSubtitle).toContainText('Manage automated AI agents');

    // 2. Create button is visible
    await expect(schedulerPage.createButton).toBeVisible();
    await expect(schedulerPage.createButton).toContainText('Create New Scheduler');

    // 3. Job list displays — at least one job should exist
    const jobCount = await schedulerPage.getJobCount();
    expect(jobCount).toBeGreaterThan(0);

    // 4. Each job card shows Name, Last run, Next run info
    const firstJobText = await schedulerPage.jobCards.first().textContent();
    expect(firstJobText).toContain('Last run:');
    expect(firstJobText).toContain('Next:');

    // 5. Each job has an enable/disable toggle
    const toggles = page.locator('[role="switch"]');
    const toggleCount = await toggles.count();
    expect(toggleCount).toBeGreaterThan(0);
  });

  test('TC-DASH-002: job details page opens when clicking a job',
    { tag: ['@smoke', '@P1'] },
    async ({ schedulerPage, page }) => {
    await schedulerPage.clickJob(0);
    await page.waitForURL('**/ai-task-scheduler/management/**', { timeout: 15_000 });
    expect(page.url()).toMatch(/\/ai-task-scheduler\/management\/[a-f0-9]+/);
  });

  test('TC-DASH-003: search and filter controls are visible',
    { tag: ['@sanity', '@P2'] },
    async ({ schedulerPage }) => {
    await expect(schedulerPage.searchInput).toBeVisible();
    await expect(schedulerPage.searchInput).toHaveAttribute('placeholder', 'Search');
    await expect(schedulerPage.searchButton).toBeVisible();
    await expect(schedulerPage.statusDropdown).toBeVisible();
    await expect(schedulerPage.statusDropdown).toContainText('All Status');
    await expect(schedulerPage.sortDropdown).toBeVisible();
    await expect(schedulerPage.sortDropdown).toContainText('Last update');
  });

  test('TC-DASH-004: Create New Scheduler button navigates to create page',
    { tag: ['@smoke', '@P1'] },
    async ({ schedulerPage, page }) => {
    await schedulerPage.clickCreateNew();
    expect(page.url()).toContain('/create');
  });
});
