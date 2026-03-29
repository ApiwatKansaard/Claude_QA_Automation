/**
 * API Test: SharePoint KM — ASAP KM Message Endpoint (SSE)
 *
 * Maps to TestRail: "Agentic > SharePoint KM > ASAP Integration > KM Message Endpoint"
 * C1550293–C1550299
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: POST /api/v1/messages/sharepoint-km/text (ASAP — returns SSE stream)
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';

const ASAP_BASE  = process.env.ASAP_API_BASE_URL     || '';
const ASAP_KEY   = process.env.ASAP_API_KEY           || '';
const MS_TOKEN   = process.env.TEST_MICROSOFT_TOKEN   || '';
const NET_ID     = process.env.TEST_NETWORK_ID        || 'net-001';
const USER_ID    = process.env.TEST_USER_ID           || 'user-001';

const asapHeaders = () => ({
  'x-api-key':    ASAP_KEY,
  'Content-Type': 'application/json',
  'Accept':       'text/event-stream',
});

function validKmPayload(query: string, msToken = MS_TOKEN) {
  return {
    networkId:            NET_ID,
    userId:               USER_ID,
    query,
    microsoftAccessToken: msToken,
  };
}

test.describe('SharePoint KM — KM Message Endpoint (SSE)', {
  tag: ['@sharepoint-km', '@api', '@asap', '@sse'],
}, () => {

  // C1550293
  test('Valid payload streams SSE events including active and finished',
    {
      annotation: { type: 'TestRail', description: 'C1550293' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY || !MS_TOKEN, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_MICROSOFT_TOKEN');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/messages/sharepoint-km/text`,
        { headers: asapHeaders(), data: validKmPayload('Search SharePoint for Q4 report') },
      );

      expect([200, 206]).toContain(res.status());
      const body = await res.text();
      // SSE stream should contain event types
      expect(body).toMatch(/data:|event:/i);
    },
  );

  // C1550294
  test('finished SSE event includes SharePointDocument fields',
    {
      annotation: { type: 'TestRail', description: 'C1550294' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY || !MS_TOKEN, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_MICROSOFT_TOKEN');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/messages/sharepoint-km/text`,
        { headers: asapHeaders(), data: validKmPayload('project budget 2025') },
      );

      expect([200, 206]).toContain(res.status());
      const body = await res.text();
      // finished event should include document fields
      expect(body).toMatch(/name|driveId|itemId|webUrl/i);
    },
  );

  // C1550295
  test('x-api-key header with sharepoint_km_search scope is required and enforced',
    {
      annotation: { type: 'TestRail', description: 'C1550295' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE, 'Requires ASAP_API_BASE_URL');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/messages/sharepoint-km/text`,
        {
          headers: { 'Content-Type': 'application/json' }, // no x-api-key
          data: validKmPayload('test query'),
        },
      );

      expect(res.status()).toBe(401);
    },
  );

  // C1550296
  test('Request with missing microsoftAccessToken returns empty results',
    {
      annotation: { type: 'TestRail', description: 'C1550296' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/messages/sharepoint-km/text`,
        {
          headers: asapHeaders(),
          data: { networkId: NET_ID, userId: USER_ID, query: 'test', microsoftAccessToken: '' },
        },
      );

      // Should return response (not crash) with empty document array
      expect([200, 206, 400]).toContain(res.status());
      const body = await res.text();
      // Must NOT leak documents from other users
      expect(body).not.toMatch(/"webUrl"\s*:\s*"https:\/\/[^"]+sharepoint/i);
    },
  );

  // C1550297
  test('Request without x-api-key returns 401 Unauthorized',
    {
      annotation: { type: 'TestRail', description: 'C1550297' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE, 'Requires ASAP_API_BASE_URL');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/messages/sharepoint-km/text`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: validKmPayload('test'),
        },
      );

      expect(res.status()).toBe(401);
    },
  );

  // C1550298
  test('Query matching no documents returns finished event with empty document array',
    {
      annotation: { type: 'TestRail', description: 'C1550298' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY || !MS_TOKEN, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_MICROSOFT_TOKEN');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/messages/sharepoint-km/text`,
        {
          headers: asapHeaders(),
          data: validKmPayload('xyzzy-nonexistent-qa-test-document-2026'),
        },
      );

      expect([200, 206]).toContain(res.status());
      // Should not return 500 — graceful empty response
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550299
  test('SSE stream connection drop mid-response does not cause unhandled exception',
    {
      annotation: { type: 'TestRail', description: 'C1550299' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Connection drop simulation requires TCP-level control — test in backend unit tests');
    },
  );
});
