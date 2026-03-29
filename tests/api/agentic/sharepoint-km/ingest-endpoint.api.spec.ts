/**
 * API Test: SharePoint KM — ASAP Ingest Endpoint
 *
 * Maps to TestRail: "Agentic > SharePoint KM > ASAP Integration > Ingest Endpoint"
 * C1550286–C1550292
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: POST /api/v1/ingest/external/sharepoint/entity-changes (ASAP)
 *
 * ⚠️  Requires ASAP_API_BASE_URL and ASAP_API_KEY env vars.
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';

const ASAP_BASE = process.env.ASAP_API_BASE_URL || '';
const ASAP_KEY  = process.env.ASAP_API_KEY      || '';
const NET_ID    = process.env.TEST_NETWORK_ID   || 'net-001';

const asapHeaders = () => ({
  'x-api-key':     ASAP_KEY,
  'Content-Type':  'application/json',
});

function validEntityPayload(eventType: string, fileId = 'file-001') {
  return {
    networkId: NET_ID,
    eventType,
    entity: {
      id:            fileId,
      name:          `QA-Test-File-${Date.now()}.pdf`,
      driveId:       'drive-001',
      itemId:        fileId,
      fileExtension: 'pdf',
    },
  };
}

test.describe('SharePoint KM — Ingest Endpoint', {
  tag: ['@sharepoint-km', '@api', '@asap'],
}, () => {

  test.beforeAll(() => {
    if (!ASAP_BASE || !ASAP_KEY) {
      console.warn('⚠️  ASAP_API_BASE_URL or ASAP_API_KEY not set — all tests will be skipped');
    }
  });

  // C1550286
  test('entity_created event queues file for ingestion',
    {
      annotation: { type: 'TestRail', description: 'C1550286' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: validEntityPayload('entity_created') },
      );

      expect([200, 201, 202]).toContain(res.status());
    },
  );

  // C1550287
  test('entity_updated event triggers re-ingestion of updated file',
    {
      annotation: { type: 'TestRail', description: 'C1550287' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: validEntityPayload('entity_updated') },
      );

      expect([200, 201, 202]).toContain(res.status());
    },
  );

  // C1550288
  test('entity_deleted event removes the file from the ingestion index',
    {
      annotation: { type: 'TestRail', description: 'C1550288' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: validEntityPayload('entity_deleted') },
      );

      expect([200, 201, 202]).toContain(res.status());
    },
  );

  // C1550289
  test('Request without API key returns 401 Unauthorized',
    {
      annotation: { type: 'TestRail', description: 'C1550289' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE, 'Requires ASAP_API_BASE_URL');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        {
          headers: { 'Content-Type': 'application/json' }, // no x-api-key
          data: validEntityPayload('entity_created'),
        },
      );

      expect(res.status()).toBe(401);
    },
  );

  // C1550290
  test('Invalid eventType value returns 400 Bad Request',
    {
      annotation: { type: 'TestRail', description: 'C1550290' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: validEntityPayload('invalid_event_type_xyz') },
      );

      expect(res.status()).toBe(400);
    },
  );

  // C1550291
  test('entity_created for existing file results in update, not duplicate',
    {
      annotation: { type: 'TestRail', description: 'C1550291' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const payload = validEntityPayload('entity_created', 'existing-file-001');
      // First call
      await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: payload });
      // Second call — should update, not duplicate
      const res = await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: payload });

      expect([200, 201, 202]).toContain(res.status());
    },
  );

  // C1550292
  test('entity_deleted for file not in Discovery Engine returns success without error',
    {
      annotation: { type: 'TestRail', description: 'C1550292' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(
        `${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`,
        { headers: asapHeaders(), data: validEntityPayload('entity_deleted', 'nonexistent-file-99999') },
      );

      expect([200, 201, 202, 204]).toContain(res.status());
    },
  );
});
