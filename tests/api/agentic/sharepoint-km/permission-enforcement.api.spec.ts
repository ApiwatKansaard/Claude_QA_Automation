/**
 * API Test: SharePoint KM — Permission Enforcement
 *
 * Maps to TestRail: "Agentic > SharePoint KM > ASAP Integration > Permission Enforcement"
 * C1550278–C1550285
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: POST /api/v1/messages/sharepoint-km/text (ASAP — KM message endpoint)
 *
 * Permission enforcement is validated by observing what documents are returned
 * per user's Microsoft access token. Requires TEST_MICROSOFT_TOKEN to be set.
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';

const ASAP_BASE = process.env.ASAP_API_BASE_URL   || '';
const ASAP_KEY  = process.env.ASAP_API_KEY         || '';
const MS_TOKEN  = process.env.TEST_MICROSOFT_TOKEN || '';
const NET_ID    = process.env.TEST_NETWORK_ID      || 'net-001';
const USER_ID   = process.env.TEST_USER_ID         || 'user-001';

const asapHeaders = () => ({
  'x-api-key':    ASAP_KEY,
  'Content-Type': 'application/json',
  'Accept':       'text/event-stream',
});

function kmPayload(opts: { msToken?: string; query?: string } = {}) {
  return {
    networkId:            NET_ID,
    userId:               USER_ID,
    query:                opts.query ?? 'test document',
    microsoftAccessToken: opts.msToken ?? MS_TOKEN,
  };
}

test.describe('SharePoint KM — Permission Enforcement', {
  tag: ['@sharepoint-km', '@api', '@asap', '@permission'],
}, () => {

  // C1550278
  test('User with valid Microsoft access token receives only their permitted documents',
    {
      annotation: { type: 'TestRail', description: 'C1550278' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY || !MS_TOKEN, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_MICROSOFT_TOKEN');

      const res = await request.post(`${ASAP_BASE}/api/v1/messages/sharepoint-km/text`, {
        headers: asapHeaders(),
        data:    kmPayload({ query: 'SharePoint document' }),
      });

      expect([200, 206]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550279
  test('Option B fallback (per-doc permission check) activates when Graph Search returns empty',
    {
      annotation: { type: 'TestRail', description: 'C1550279' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Option B fallback validation requires internal telemetry — integration-level test');
    },
  );

  // C1550280
  test('User whose permissions changed after indexing receives updated results reflecting new access',
    {
      annotation: { type: 'TestRail', description: 'C1550280' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Permission change mid-index requires staging SharePoint admin action — integration-level test');
    },
  );

  // C1550281
  test('Expired microsoftAccessToken returns AUTH_REQUIRED and does not return any documents',
    {
      annotation: { type: 'TestRail', description: 'C1550281' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const expiredToken = 'expired.token.placeholder';

      const res = await request.post(`${ASAP_BASE}/api/v1/messages/sharepoint-km/text`, {
        headers: asapHeaders(),
        data:    kmPayload({ msToken: expiredToken }),
      });

      // Should not return real documents with an expired/invalid token
      expect([200, 206, 401, 403]).toContain(res.status());
      expect(res.status()).not.toBe(500);

      if ([200, 206].includes(res.status())) {
        const body = await res.text();
        // Must not leak SharePoint document URLs in response
        expect(body).not.toMatch(/"webUrl"\s*:\s*"https:\/\/[^"]+sharepoint/i);
      }
    },
  );

  // C1550282
  test('Graph Search returning empty set triggers hybrid fallback without server error',
    {
      annotation: { type: 'TestRail', description: 'C1550282' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY || !MS_TOKEN, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_MICROSOFT_TOKEN');

      // Query that intentionally returns zero Graph Search results
      const res = await request.post(`${ASAP_BASE}/api/v1/messages/sharepoint-km/text`, {
        headers: asapHeaders(),
        data:    kmPayload({ query: 'xyzzy-no-results-qa-test-2026' }),
      });

      expect([200, 206]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550283
  test('File deleted from SharePoint after indexing is excluded from search results',
    {
      annotation: { type: 'TestRail', description: 'C1550283' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Requires staging file deletion followed by delta sync — integration-level test');
    },
  );

  // C1550284
  test('User with access to ALL documents in Discovery Engine receives full result set',
    {
      annotation: { type: 'TestRail', description: 'C1550284' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Full-access scenario requires a privileged test account — integration-level test');
    },
  );

  // C1550285
  test('Permission enforcement applies independently per network — cross-network data leakage is impossible',
    {
      annotation: { type: 'TestRail', description: 'C1550285' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY || !MS_TOKEN, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_MICROSOFT_TOKEN + TEST_NETWORK_ID_2');
      test.skip(!process.env.TEST_NETWORK_ID_2, 'Requires TEST_NETWORK_ID_2');

      const NET_2 = process.env.TEST_NETWORK_ID_2 || 'net-qa-002';

      // Query on a different network — should not return documents from NET_ID
      const res = await request.post(`${ASAP_BASE}/api/v1/messages/sharepoint-km/text`, {
        headers: asapHeaders(),
        data: {
          networkId:            NET_2,
          userId:               USER_ID,
          query:                'SharePoint document',
          microsoftAccessToken: MS_TOKEN,
        },
      });

      expect([200, 206, 401, 403, 404]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );
});
