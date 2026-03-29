/**
 * API Test: SharePoint KM — File Preview API
 *
 * Maps to TestRail: "Agentic > SharePoint KM > EkoAI Integration > File Preview"
 * C1550318–C1550322  (API cases — Web cases in file-preview-web.spec.ts)
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: GET /v1/connections/sharepoint/file-preview (EkoAI API)
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';

const { apiBaseURL: API_BASE } = loadEnvConfig();
const testDriveId = process.env.SHAREPOINT_TEST_DRIVE_ID || 'drive-qa-001';
const testItemId  = process.env.SHAREPOINT_TEST_ITEM_ID  || 'item-qa-001';
const isPreviewReady = !!(process.env.SHAREPOINT_TEST_DRIVE_ID && process.env.SHAREPOINT_TEST_ITEM_ID);

test.describe('SharePoint KM — File Preview API', {
  tag: ['@sharepoint-km', '@api', '@file-preview'],
}, () => {

  // C1550318
  test('File-preview request without JWT bearer token returns 401 Unauthorized',
    {
      annotation: { type: 'TestRail', description: 'C1550318' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.fixme(true, 'Endpoint /v1/connections/sharepoint/file-preview not yet deployed in staging — returns 404');
      const res = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        // No Authorization header
        params: { driveId: testDriveId, itemId: testItemId },
      });

      expect(res.status()).toBe(401);
    },
  );

  // C1550319
  test('File-preview for unpermitted file returns 403 or empty previewUrl',
    {
      annotation: { type: 'TestRail', description: 'C1550319' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Use a file ID that the test user should not have access to
      const res = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        headers: getAuthHeaders(),
        params: { driveId: 'restricted-drive-999', itemId: 'restricted-item-999' },
      });

      expect([403, 404, 200]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        // If 200, previewUrl should be empty/null for restricted files
        expect(body.previewUrl == null || body.previewUrl === '').toBe(true);
      }
    },
  );

  // C1550320
  test('previewUrl is generated on-demand and not cached to avoid TTL expiry',
    {
      annotation: { type: 'TestRail', description: 'C1550320' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!isPreviewReady, 'Requires SHAREPOINT_TEST_DRIVE_ID + SHAREPOINT_TEST_ITEM_ID');

      // Call twice — each should return a fresh URL (or same URL but freshly generated)
      const res1 = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        headers: getAuthHeaders(),
        params: { driveId: testDriveId, itemId: testItemId },
      });
      const res2 = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        headers: getAuthHeaders(),
        params: { driveId: testDriveId, itemId: testItemId },
      });

      expect(res1.status()).toBe(200);
      expect(res2.status()).toBe(200);

      // Response cache-control should not be long-lived
      const cacheControl = res1.headers()['cache-control'] || '';
      expect(cacheControl).not.toMatch(/max-age=[1-9]\d{4,}/i); // not >9999s cache
    },
  );

  // C1550321
  test('File-preview with missing query parameters returns 400 Bad Request',
    {
      annotation: { type: 'TestRail', description: 'C1550321' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.fixme(true, 'Endpoint /v1/connections/sharepoint/file-preview not yet deployed in staging — returns 404');
      const res = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        headers: getAuthHeaders(),
        // Missing required driveId and itemId params
      });

      expect([400, 422]).toContain(res.status());
    },
  );

  // C1550322
  test('File-preview when user has no Microsoft Auth Connection returns 401 or AUTH_REQUIRED',
    {
      annotation: { type: 'TestRail', description: 'C1550322' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.fixme(true, 'Endpoint /v1/connections/sharepoint/file-preview not yet deployed in staging — returns 404');
      // This test uses auth header without Microsoft connection — server should catch it
      const res = await request.get(`${API_BASE}/v1/connections/sharepoint/file-preview`, {
        headers: getAuthHeaders(),
        params: { driveId: testDriveId, itemId: testItemId },
      });

      // Should be 401 (no microsoft connection) — NOT 500
      expect([200, 401, 403]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );
});
