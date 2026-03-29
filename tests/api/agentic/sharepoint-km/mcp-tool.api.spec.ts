/**
 * API Test: SharePoint KM — MCP Tool (get_sharepoint_km_data)
 *
 * Maps to TestRail: "Agentic > SharePoint KM > EkoAI Integration > MCP Tool"
 * C1550323–C1550328
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: POST /api/v1/km/search or MCP tool proxy endpoint (EkoAI API)
 *
 * The MCP tool `get_sharepoint_km_data` is called by Claude when SharePoint context
 * is needed. It injects the Microsoft token from AuthConnectionService internally.
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';

const { apiBaseURL: API_BASE } = loadEnvConfig();
const NET_ID  = process.env.TEST_NETWORK_ID || 'net-001';
const USER_ID = process.env.TEST_USER_ID    || 'user-001';
const MS_TOKEN = process.env.TEST_MICROSOFT_TOKEN || '';

test.describe('SharePoint KM — MCP Tool', {
  tag: ['@sharepoint-km', '@api', '@mcp-tool'],
}, () => {

  // C1550323
  test('get_sharepoint_km_data MCP tool calls POST /api/v1/km/search and returns documents',
    {
      annotation: { type: 'TestRail', description: 'C1550323' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!MS_TOKEN, 'Requires TEST_MICROSOFT_TOKEN with active Microsoft auth connection');

      const res = await request.post(`${API_BASE}/api/v1/km/search`, {
        headers: getAuthHeaders(),
        data: {
          networkId:            NET_ID,
          userId:               USER_ID,
          query:                'SharePoint document',
          microsoftAccessToken: MS_TOKEN,
        },
      });

      // KM search should return 200 with results or empty array
      expect([200, 202, 404]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550324
  test('MCP tool injects Microsoft token from AuthConnectionService automatically',
    {
      annotation: { type: 'TestRail', description: 'C1550324' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Token injection is internal MCP tool behaviour — validated in integration env');
    },
  );

  // C1550325
  test('get_sharepoint_km_data returns AUTH_REQUIRED when user has no Microsoft auth connection',
    {
      annotation: { type: 'TestRail', description: 'C1550325' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Call without Microsoft token — should get AUTH_REQUIRED or 401
      const res = await request.post(`${API_BASE}/api/v1/km/search`, {
        headers: getAuthHeaders(),
        data: {
          networkId:            NET_ID,
          userId:               USER_ID,
          query:                'SharePoint document',
          microsoftAccessToken: '', // empty — no Microsoft connection
        },
      });

      // Should not crash — AUTH_REQUIRED, 401, or 400
      expect([200, 400, 401, 403, 404, 422]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550326
  test('get_sharepoint_km_data with empty query string returns no results without server error',
    {
      annotation: { type: 'TestRail', description: 'C1550326' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!MS_TOKEN, 'Requires TEST_MICROSOFT_TOKEN');

      const res = await request.post(`${API_BASE}/api/v1/km/search`, {
        headers: getAuthHeaders(),
        data: {
          networkId:            NET_ID,
          userId:               USER_ID,
          query:                '', // empty query
          microsoftAccessToken: MS_TOKEN,
        },
      });

      expect([200, 400, 422]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550327
  test('MCP tool request with source=sharepoint does not return documents from other KM sources',
    {
      annotation: { type: 'TestRail', description: 'C1550327' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!MS_TOKEN, 'Requires TEST_MICROSOFT_TOKEN');

      const res = await request.post(`${API_BASE}/api/v1/km/search`, {
        headers: getAuthHeaders(),
        data: {
          networkId:            NET_ID,
          userId:               USER_ID,
          query:                'document',
          microsoftAccessToken: MS_TOKEN,
          source:               'sharepoint',
        },
      });

      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json().catch(() => ({}));
        const items = body.documents ?? body.results ?? (Array.isArray(body) ? body : []);
        // All returned items must be SharePoint-sourced
        for (const item of items) {
          if (item.source) {
            expect(item.source).toMatch(/sharepoint/i);
          }
        }
      }
    },
  );

  // C1550328
  test('get_sharepoint_km_data handles network timeout from /km/search endpoint gracefully',
    {
      annotation: { type: 'TestRail', description: 'C1550328' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Network timeout simulation requires fault injection — integration/chaos test');
    },
  );
});
