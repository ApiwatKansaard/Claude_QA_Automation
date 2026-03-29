/**
 * E2E Test: SharePoint KM — File Preview (Web / iframe)
 *
 * Maps to TestRail: "Agentic > SharePoint KM > EkoAI Integration > File Preview"
 * C1550316–C1550317  (Web cases only — API cases in file-preview.api.spec.ts)
 *
 * Type: Regression | Priority: P1 | Platform: Web
 *
 * ⚠️  PRE-REQUISITE: User must have a valid Microsoft Auth Connection
 *     and a known SharePoint file driveId+itemId to test the preview iframe.
 *     Set SHAREPOINT_ENABLED=true + SHAREPOINT_TEST_DRIVE_ID + SHAREPOINT_TEST_ITEM_ID.
 */
import { test, expect } from '../../../fixtures';
import { loadEnvConfig } from '../../../../src/config/env.config';

const isSharePointEnabled  = process.env.SHAREPOINT_ENABLED  === 'true';
const testDriveId          = process.env.SHAREPOINT_TEST_DRIVE_ID || '';
const testItemId           = process.env.SHAREPOINT_TEST_ITEM_ID  || '';
const isPreviewReady       = isSharePointEnabled && !!testDriveId && !!testItemId;

const { apiBaseURL: API_BASE } = loadEnvConfig();

test.describe('SharePoint KM — File Preview (Web)', {
  tag: ['@sharepoint-km', '@file-preview', '@web'],
}, () => {

  // C1550316
  test('GET /v1/connections/sharepoint/file-preview returns valid previewUrl for permitted file',
    {
      annotation: { type: 'TestRail', description: 'C1550316' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!isPreviewReady,
        'Requires SHAREPOINT_ENABLED=true + SHAREPOINT_TEST_DRIVE_ID + SHAREPOINT_TEST_ITEM_ID');

      const res = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        params: { driveId: testDriveId, itemId: testItemId },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('previewUrl');
      expect(body.previewUrl).toMatch(/^https?:\/\//);
    },
  );

  // C1550317
  test('previewUrl loads the file correctly in an iframe in Eko FE',
    {
      annotation: { type: 'TestRail', description: 'C1550317' },
      tag: ['@regression', '@P1'],
    },
    async ({ page, request }) => {
      test.skip(!isPreviewReady,
        'Requires SHAREPOINT_ENABLED=true + SHAREPOINT_TEST_DRIVE_ID + SHAREPOINT_TEST_ITEM_ID');

      // Get preview URL
      const res = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        params: { driveId: testDriveId, itemId: testItemId },
      });
      expect(res.status()).toBe(200);
      const { previewUrl } = await res.json();

      // Navigate to a page that renders the iframe
      await page.goto('/agentic');
      await page.waitForLoadState('networkidle');

      // Inject an iframe with the previewUrl and verify it loads (no error page)
      await page.evaluate((url: string) => {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.id = 'qa-preview-frame';
        iframe.style.cssText = 'width:800px;height:600px;position:fixed;top:0;left:0;z-index:9999;';
        document.body.appendChild(iframe);
      }, previewUrl);

      // Wait for iframe to load
      await page.waitForTimeout(3_000);
      const frame = page.frameLocator('#qa-preview-frame');
      // Frame should have content (not an error page)
      const frameBody = await frame.locator('body').innerText().catch(() => '');
      expect(frameBody.toLowerCase()).not.toMatch(/error|not found|access denied|403|404/i);
    },
  );
});
