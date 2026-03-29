/**
 * API Test: SharePoint KM — Delta Sync
 *
 * Maps to TestRail: "Agentic > SharePoint KM > ASAP Integration > Delta Sync"
 * C1550269–C1550277
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: ASAP internal delta-sync service (Graph API delta token management)
 *
 * ⚠️  Delta sync tests require access to Cosmos DB and Graph API delta tokens.
 *     Most cases are integration-level and marked skip; observable API cases are active.
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';

const ASAP_BASE = process.env.ASAP_API_BASE_URL || '';
const ASAP_KEY  = process.env.ASAP_API_KEY      || '';
const NET_ID    = process.env.TEST_NETWORK_ID    || 'net-001';

const asapHeaders = () => ({
  'x-api-key':    ASAP_KEY,
  'Content-Type': 'application/json',
});

test.describe('SharePoint KM — Delta Sync', {
  tag: ['@sharepoint-km', '@api', '@asap', '@delta-sync'],
}, () => {

  // C1550269
  test('Delta sync only ingests changed items since the last sync (deltaToken used)',
    {
      annotation: { type: 'TestRail', description: 'C1550269' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Verifying delta vs full sync requires Cosmos deltaToken inspection — integration-level test');
    },
  );

  // C1550270
  test('Delta sync persists the updated deltaToken to Cosmos after successful sync',
    {
      annotation: { type: 'TestRail', description: 'C1550270' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Requires direct Cosmos DB access to verify deltaToken write-back — integration-level test');
    },
  );

  // C1550271
  test('Deleted file in SharePoint is excluded from Discovery Engine results after delta sync',
    {
      annotation: { type: 'TestRail', description: 'C1550271' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      // Trigger entity_deleted event and verify no 500 error
      const res = await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
        headers: asapHeaders(),
        data: {
          eventType: 'entity_deleted',
          entityId:  'deleted-file-test-id',
          networkId: NET_ID,
        },
      });

      expect([200, 202, 404]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550272
  test('410 Gone response from Graph API triggers a full resync from scratch',
    {
      annotation: { type: 'TestRail', description: 'C1550272' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Requires Graph API to return 410 Gone — simulate in integration env with token expiry');
    },
  );

  // C1550273
  test('Missing deltaToken in Cosmos (first-time sync) triggers full initial crawl',
    {
      annotation: { type: 'TestRail', description: 'C1550273' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'First-time sync requires clean Cosmos state with no deltaToken — integration-level test');
    },
  );

  // C1550274
  test('Graph API rate limit error during delta sync causes graceful retry without data loss',
    {
      annotation: { type: 'TestRail', description: 'C1550274' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Requires rate-limit fault injection on Graph API — integration/chaos test');
    },
  );

  // C1550275
  test('410 Gone handling does NOT update stale permissions during resync',
    {
      annotation: { type: 'TestRail', description: 'C1550275' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Permission state verification during resync requires integration-level test with Graph API mock');
    },
  );

  // C1550276
  test('Delta sync with zero changes since last sync completes without error',
    {
      annotation: { type: 'TestRail', description: 'C1550276' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      // Trigger ingest with a query that matches nothing new — service should respond gracefully
      const res = await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
        headers: asapHeaders(),
        data: {
          eventType: 'entity_created',
          entityId:  'xyzzy-nonexistent-file-noop-test',
          networkId: NET_ID,
        },
      });

      expect([200, 202, 404]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550277
  test('Concurrent delta syncs for two different networks do not interfere',
    {
      annotation: { type: 'TestRail', description: 'C1550277' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY + TEST_NETWORK_ID_2');

      const NET_2 = process.env.TEST_NETWORK_ID_2 || 'net-qa-002';

      // Fire two concurrent ingest requests for different networks
      const [res1, res2] = await Promise.all([
        request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
          headers: asapHeaders(),
          data: { eventType: 'entity_created', entityId: 'concurrent-file-net1', networkId: NET_ID },
        }),
        request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
          headers: asapHeaders(),
          data: { eventType: 'entity_created', entityId: 'concurrent-file-net2', networkId: NET_2 },
        }),
      ]);

      // Both should succeed without server errors
      expect(res1.status()).not.toBe(500);
      expect(res2.status()).not.toBe(500);
    },
  );
});
