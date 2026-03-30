import { BasePage } from '../../base.page';
import type { Page, Locator } from '@playwright/test';

/**
 * WidgetRenderingPage — helpers for verifying Morning Brief widget rendering.
 *
 * Widget rendering in Morning Brief is the structure of the HomePage content
 * delivered to users. This page object provides:
 *   1. API request helpers to trigger a job and capture the response payload
 *   2. Assertion helpers for content.blocks structure validation
 *
 * The actual rendering happens in the Eko app home page (outside the Console).
 * Console-side verification is done via History Log detail view.
 */
export class WidgetRenderingPage extends BasePage {
  // History Log selectors (used to inspect delivered content)
  readonly historyLogTab: Locator;
  readonly audienceCountBtn: Locator;
  readonly historyTable: Locator;
  readonly paginationNext: Locator;

  constructor(page: Page) {
    super(page);
    this.historyLogTab = page.getByRole('button', { name: 'History Log' });
    this.audienceCountBtn = page.getByRole('button', { name: /audiences/ }).first();
    this.historyTable = page.getByText('Job Name').first();
    this.paginationNext = page
      .locator('button')
      .filter({ has: page.locator('img[alt="right"]') })
      .first();
  }

  /** Navigate to the History Log tab for a given job */
  async gotoHistoryTab(jobId: string): Promise<void> {
    await this.navigate(`/ai-task-scheduler/management/${jobId}?tab=history_log`);
  }

  /**
   * Validate that a content.blocks array has the correct structure.
   * Used in API-level widget tests to assert the response payload shape.
   */
  validateContentBlocks(blocks: unknown[]): void {
    if (!Array.isArray(blocks)) {
      throw new Error(`content.blocks must be an array, got: ${typeof blocks}`);
    }
    for (const block of blocks) {
      if (typeof block !== 'object' || block === null) {
        throw new Error(`Each block must be an object, got: ${typeof block}`);
      }
      const b = block as Record<string, unknown>;
      if (!b.type) {
        throw new Error(`Block missing required field: type`);
      }
    }
  }

  /**
   * Known valid widget types for Morning Brief.
   * Sourced from spec: recognized types render, unrecognized types are silently ignored.
   */
  static readonly VALID_WIDGET_TYPES = [
    'home_page',
    'text',
    'image',
    'carousel',
    'wrapper',
    'banner',
    'button',
  ] as const;
}
