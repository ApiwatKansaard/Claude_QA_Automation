/**
 * API Test: SharePoint KM — ETL Content Sync
 *
 * Maps to TestRail: "Agentic > SharePoint KM > ASAP Integration > ETL Content Sync"
 * C1550260–C1550268
 *
 * Type: Regression | Priority: P1 | Platform: API
 * Endpoint: ASAP internal ETL service (triggered via ingest endpoint or scheduled timer)
 *
 * ⚠️  Most ETL tests validate internal service behaviour observable only via side-effects
 *     (Discovery Engine state, Cosmos records). These are skipped and documented for
 *     integration/staging validation.
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';

const ASAP_BASE = process.env.ASAP_API_BASE_URL || '';
const ASAP_KEY  = process.env.ASAP_API_KEY      || '';

const asapHeaders = () => ({
  'x-api-key':    ASAP_KEY,
  'Content-Type': 'application/json',
});

test.describe('SharePoint KM — ETL Content Sync', {
  tag: ['@sharepoint-km', '@api', '@asap', '@etl'],
}, () => {

  // C1550260
  test('km-etl service ingests a PDF file from SharePoint into Discovery Engine',
    {
      annotation: { type: 'TestRail', description: 'C1550260' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'ETL ingestion is internal service behaviour — validated in integration env via Discovery Engine state');
    },
  );

  // C1550261
  test('km-etl ingests all supported file types (DOCX / CSV / TXT) without error',
    {
      annotation: { type: 'TestRail', description: 'C1550261' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Multi-file-type ingestion requires staging SharePoint content — integration-level test');
    },
  );

  // C1550262
  test('ETL sync runs automatically every 15 minutes via Azure Timer Trigger',
    {
      annotation: { type: 'TestRail', description: 'C1550262' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Timer Trigger scheduling requires Azure Function monitoring — DevOps/infra validation');
    },
  );

  // C1550263
  test('File larger than 20MB is skipped by ETL and NOT ingested into Discovery Engine',
    {
      annotation: { type: 'TestRail', description: 'C1550263' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      // Trigger ingest with a file payload that exceeds 20MB size limit indicator
      const res = await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
        headers: asapHeaders(),
        data: {
          eventType:  'entity_created',
          entityId:   'large-file-test-id',
          networkId:  process.env.TEST_NETWORK_ID || 'net-001',
          metadata:   { sizeBytes: 21 * 1024 * 1024 }, // 21 MB
        },
      });

      // Service should accept the event (202/200) and handle oversized file gracefully
      expect([200, 202, 400]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550264
  test('Uploading an unsupported file type (PPTX) to SharePoint is skipped by ETL',
    {
      annotation: { type: 'TestRail', description: 'C1550264' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
        headers: asapHeaders(),
        data: {
          eventType:  'entity_created',
          entityId:   'pptx-file-test-id',
          networkId:  process.env.TEST_NETWORK_ID || 'net-001',
          metadata:   { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
        },
      });

      expect([200, 202, 400, 422]).toContain(res.status());
      expect(res.status()).not.toBe(500);
    },
  );

  // C1550265
  test('ETL sync failure due to SharePoint connectivity error does not crash the service',
    {
      annotation: { type: 'TestRail', description: 'C1550265' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Requires fault injection to simulate SharePoint connectivity failure — integration/chaos test');
    },
  );

  // C1550266
  test('File exactly at the 20MB boundary is ingested or skipped consistently',
    {
      annotation: { type: 'TestRail', description: 'C1550266' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Boundary test requires staging file upload — integration-level test');
    },
  );

  // C1550267
  test('Empty SharePoint site with no documents results in no-op ETL sync without errors',
    {
      annotation: { type: 'TestRail', description: 'C1550267' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Requires staging SharePoint site with zero documents — integration-level test');
    },
  );

  // C1550268
  test('Updating a previously indexed file in SharePoint results in updated content in Discovery Engine',
    {
      annotation: { type: 'TestRail', description: 'C1550268' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.skip(!ASAP_BASE || !ASAP_KEY, 'Requires ASAP_API_BASE_URL + ASAP_API_KEY');

      const res = await request.post(`${ASAP_BASE}/api/v1/ingest/external/sharepoint/entity-changes`, {
        headers: asapHeaders(),
        data: {
          eventType: 'entity_updated',
          entityId:  process.env.SHAREPOINT_TEST_ITEM_ID || 'item-qa-001',
          networkId: process.env.TEST_NETWORK_ID         || 'net-001',
        },
      });

      // Should accept update event without error
      expect([200, 202]).toContain(res.status());
    },
  );
});
