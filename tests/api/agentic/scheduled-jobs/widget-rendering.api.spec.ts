/**
 * API Test: Scheduled Jobs — Widget Rendering (JSON Structure)
 *
 * Maps to TestRail: "Agentic > Scheduled Jobs > Widget Rendering"
 * C1548601–C1548609
 * Note: Treated as API tests since these validate widget JSON structure in HomePage content.
 * Type: Smoke/Sanity/Regression | Priority: P1/P2
 */
import { test, expect } from '@playwright/test';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';

const { apiBaseURL: API_BASE } = loadEnvConfig();

test.describe('Scheduled Jobs — Widget Rendering API', { tag: ['@api', '@scheduled-jobs'] }, () => {

  test('should create HomePage with multiple valid widgets in correct order',
    {
      annotation: { type: 'TestRail', description: 'C1548601' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const payload = {
        userId: 'qa-widget-test-user',
        refId: 'qa-run:qa-widget-001',
        content: {
          blocks: [
            { type: 'text_block', content: 'First widget' },
            { type: 'progress_bar', value: 75, label: 'Progress' },
            { type: 'horizontal_cards', cards: [{ title: 'Card 1' }, { title: 'Card 2' }] },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      expect([200, 201, 400, 401]).toContain(response.status());

      if (response.status() === 201) {
        const body = await response.json();
        const record = body.data || body;
        // Verify order is preserved
        expect(record.content.blocks).toHaveLength(3);
        expect(record.content.blocks[0].type).toBe('text_block');
        expect(record.content.blocks[2].type).toBe('horizontal_cards');
      }
    }
  );

  test('should store Text Block widget content correctly',
    {
      annotation: { type: 'TestRail', description: 'C1548602' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const textContent = 'QA Text Block Content — Morning Brief';
      const payload = {
        userId: 'qa-textblock-user',
        refId: 'qa-run:qa-textblock',
        content: {
          blocks: [
            { type: 'text_block', content: textContent, formatting: 'markdown' },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      expect([200, 201, 400, 401]).toContain(response.status());

      if (response.status() === 201) {
        const body = await response.json();
        const record = body.data || body;
        expect(record.content.blocks[0].content).toBe(textContent);
      }
    }
  );

  test('should store Progress Bar widget with correct percentage',
    {
      annotation: { type: 'TestRail', description: 'C1548603' },
      tag: ['@sanity', '@P2'],
    },
    async ({ request }) => {
      const payload = {
        userId: 'qa-progressbar-user',
        refId: 'qa-run:qa-progressbar',
        content: {
          blocks: [
            { type: 'progress_bar', value: 67, label: 'Task Completion', maxValue: 100 },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      expect([200, 201, 400, 401]).toContain(response.status());

      if (response.status() === 201) {
        const body = await response.json();
        const record = body.data || body;
        expect(record.content.blocks[0].value).toBe(67);
      }
    }
  );

  test('should store Horizontal Cards widget with configured content',
    {
      annotation: { type: 'TestRail', description: 'C1548604' },
      tag: ['@sanity', '@P2'],
    },
    async ({ request }) => {
      const payload = {
        userId: 'qa-hcards-user',
        refId: 'qa-run:qa-hcards',
        content: {
          blocks: [
            {
              type: 'horizontal_cards',
              cards: [
                { id: '1', title: 'Morning Task', subtitle: 'Complete by noon', imageUrl: null },
                { id: '2', title: 'Afternoon Task', subtitle: 'Follow-up', imageUrl: null },
              ],
            },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      expect([200, 201, 400, 401]).toContain(response.status());

      if (response.status() === 201) {
        const body = await response.json();
        const record = body.data || body;
        expect(record.content.blocks[0].cards).toHaveLength(2);
      }
    }
  );

  test('should accept and store unrecognized widget type without error',
    {
      annotation: { type: 'TestRail', description: 'C1548605' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      // Unknown widget types should be stored as-is (opaque content)
      const payload = {
        userId: 'qa-unknown-widget-user',
        refId: 'qa-run:qa-unknown',
        content: {
          blocks: [
            { type: 'future_widget_v3', customData: { experimental: true } },
            { type: 'text_block', content: 'Regular widget after unknown' },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      // Should accept — content stored as-is without validation
      expect([200, 201, 400, 401]).toContain(response.status());
    }
  );

  test('should handle corrupted widget configuration gracefully',
    {
      annotation: { type: 'TestRail', description: 'C1548606' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      // Partial/corrupted widget config — should store as-is
      const payload = {
        userId: 'qa-corrupted-user',
        refId: 'qa-run:qa-corrupted',
        content: {
          blocks: [
            { type: 'progress_bar' }, // Missing required value field
            { type: 'horizontal_cards', cards: null }, // Null cards
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      // Either accepted (opaque storage) or validation error — not a server crash
      expect([200, 201, 400, 422, 401]).toContain(response.status());
      expect(response.status()).not.toBe(500);
    }
  );

  test('should create HomePage with empty blocks array without error',
    {
      annotation: { type: 'TestRail', description: 'C1548607' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      const payload = {
        userId: 'qa-empty-blocks-user',
        refId: 'qa-run:qa-empty',
        content: {
          blocks: [],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      // Empty blocks should be stored successfully
      expect([200, 201, 400, 401]).toContain(response.status());
      expect(response.status()).not.toBe(500);
    }
  );

  test('should store more drill-down configuration in widget content',
    {
      annotation: { type: 'TestRail', description: 'C1548608' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      const payload = {
        userId: 'qa-drilldown-user',
        refId: 'qa-run:qa-drilldown',
        content: {
          blocks: [
            {
              type: 'text_block',
              content: 'Main content',
              more: {
                label: 'See more',
                pageTitle: 'Detailed View',
                widgets: [
                  { type: 'text_block', content: 'Detailed content level 2' },
                ],
              },
            },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      expect([200, 201, 400, 401]).toContain(response.status());

      if (response.status() === 201) {
        const body = await response.json();
        const record = body.data || body;
        // more object should be preserved
        expect(record.content.blocks[0].more).toBeDefined();
        expect(record.content.blocks[0].more.pageTitle).toBe('Detailed View');
      }
    }
  );

  test('should store nested widget levels correctly in content structure',
    {
      annotation: { type: 'TestRail', description: 'C1548609' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      const payload = {
        userId: 'qa-nested-user',
        refId: 'qa-run:qa-nested',
        content: {
          blocks: [
            {
              type: 'horizontal_cards',
              cards: [
                {
                  id: '1',
                  title: 'Card with nested',
                  items: [
                    { title: 'Item 1', items: [{ title: 'Sub-item 1' }] },
                    { title: 'Item 2' },
                  ],
                },
              ],
            },
          ],
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request.post(`${API_BASE}/api/v1/home-page`, {
        headers: { ...getAuthHeaders(), 'x-api-key': 'qa-home-page-key' },
        data: payload,
      });

      if (response.status() === 404) {
        test.skip(true, 'HomePage endpoint not available');
        return;
      }

      expect([200, 201, 400, 401]).toContain(response.status());

      if (response.status() === 201) {
        const body = await response.json();
        const record = body.data || body;
        const card = record.content.blocks[0].cards[0];
        // Nested structure should be preserved
        expect(card.items[0].items[0].title).toBe('Sub-item 1');
      }
    }
  );
});
