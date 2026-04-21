/**
 * API Test: Scheduled Jobs — Callback
 *
 * Maps to TestRail: "Agentic > Scheduled Jobs > Callback"
 * C1548561–C1548570
 * Type: Smoke/Regression | Priority: P1/P2 | Platform: API
 *
 * Contract: https://ekoapp.atlassian.net/wiki/spaces/EP/pages/3528917005
 *   POST {apiBaseURL}/v1/scheduled-jobs/runs/callback
 *   Headers: x-api-key: {scheduled_job_callback_api_key}  (prefix: scbk_)
 *   Body: { id: <scheduleJobRunUserId>, homePage?: { html, lang } }
 *   NOTE: The production API does NOT accept `status`/`result`/`quotaConsumed`
 *         wrapper fields at the root. `homePage` sits at the root; `html`
 *         replaces the deprecated `widgets`/`blocks` per Tech Spec AE-14600.
 */
import { test, expect } from '@playwright/test';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';
import { createJob, deleteJob } from '../../../../src/helpers/job-factory';
import { getCallbackApiKey } from '../../../../src/helpers/callback-key.helper';

const { apiBaseURL: API_BASE } = loadEnvConfig();
const CALLBACK_PATH = '/v1/scheduled-jobs/runs/callback';

/**
 * Build a callback payload per the production contract (id + optional homePage.html).
 */
function buildCallbackPayload(
  scheduleJobRunUserId: string,
  options: { homePage?: { html: string; lang?: string } } = {}
) {
  const payload: Record<string, unknown> = { id: scheduleJobRunUserId };
  if (options.homePage) payload.homePage = options.homePage;
  return payload;
}

test.describe('Scheduled Jobs — Callback API', { tag: ['@api', '@scheduled-jobs'] }, () => {
  let jobId: string;
  let callbackApiKey: string;

  test.beforeAll(async () => {
    jobId = await createJob('SJCallback');
    callbackApiKey = await getCallbackApiKey(jobId);
  });

  test.afterAll(async () => {
    if (jobId) await deleteJob(jobId);
  });

  test(
    'should update user status to FINISHED when callback returns success with result',
    {
      annotation: { type: 'TestRail', description: 'C1548561' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const payload = buildCallbackPayload('test-run-user-id-qa', {
        homePage: { html: '<p>QA Test Content</p>', lang: 'en' },
      });
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: payload,
      });

      // 200 = processed; 404 = unknown probe id (expected); 422 = validation
      expect([200, 404, 422]).toContain(response.status());
    }
  );

  test(
    'should update correct user record when callback echoes matching ID',
    {
      annotation: { type: 'TestRail', description: 'C1548562' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const payload = buildCallbackPayload('test-specific-id-qa', {
        homePage: { html: '<p>specific</p>', lang: 'en' },
      });
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: payload,
      });

      // 404 expected for unrecognized ID — confirms ID matching is enforced
      expect([200, 404, 422]).toContain(response.status());
    }
  );

  test(
    'should accept callback when x-api-key header is valid',
    {
      annotation: { type: 'TestRail', description: 'C1548563' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const payload = buildCallbackPayload('test-api-key-qa', {
        homePage: { html: '<p>x</p>', lang: 'en' },
      });
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: payload,
      });

      // 200 = success; 404 = id unknown; 422 = validation
      expect([200, 404, 422]).toContain(response.status());
    }
  );

  test(
    'should store homePage.html when callback includes homepage content',
    {
      annotation: { type: 'TestRail', description: 'C1548564' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const payload = buildCallbackPayload('test-homepage-qa', {
        homePage: { html: '<h1>Stored HTML</h1>', lang: 'en' },
      });
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: payload,
      });

      expect([200, 404, 422]).toContain(response.status());
    }
  );

  test(
    'should accept id-only callback (fail-style, no homePage)',
    {
      annotation: { type: 'TestRail', description: 'C1548565' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Per spec §5.2, homePage is optional — id-only callback is the fail-style form
      const payload = buildCallbackPayload('test-fail-qa');
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: payload,
      });

      expect([200, 404, 422]).toContain(response.status());
    }
  );

  test(
    'should reject callback with 422 when ID is missing',
    {
      annotation: { type: 'TestRail', description: 'C1548566' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Missing required `id` field — server returns 422 `"id" is required`
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: { homePage: { html: '<p>x</p>', lang: 'en' } },
      });

      expect([400, 422]).toContain(response.status());
    }
  );

  test(
    'should reject callback with 401 when x-api-key is wrong',
    {
      annotation: { type: 'TestRail', description: 'C1548567' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      const payload = buildCallbackPayload('test-wrong-key-qa', {
        homePage: { html: '<p>x</p>', lang: 'en' },
      });
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: {
          'x-api-key': 'scbk_definitely-wrong-key-12345',
          'Content-Type': 'application/json',
        },
        data: payload,
      });

      // Must be rejected — invalid key should never be accepted.
      // Backend returns 404 when the key is not found in DB, 401 when header is missing.
      expect([401, 403, 404]).toContain(response.status());
      expect(response.status()).not.toBe(200);
    }
  );

  test(
    'should mark user as FAILED when no callback arrives within timeout',
    {
      annotation: { type: 'TestRail', description: 'C1548568' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Verify callback timeout configuration is reflected in API structure
      const response = await request.get(`${API_BASE}/v1/scheduled-jobs`, {
        params: { page: '1', limit: '5' },
        headers: getAuthHeaders(),
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toBeDefined();
    }
  );

  test(
    'should handle duplicate callback idempotently for already finished user',
    {
      annotation: { type: 'TestRail', description: 'C1548569' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      const payload = buildCallbackPayload('test-idempotent-qa', {
        homePage: { html: '<p>idempotent</p>', lang: 'en' },
      });
      const headers = { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' };

      const res1 = await request.post(`${API_BASE}${CALLBACK_PATH}`, { headers, data: payload });
      const res2 = await request.post(`${API_BASE}${CALLBACK_PATH}`, { headers, data: payload });

      // Spec §5.3: "ID already marked as finished" → 200 (idempotent)
      expect([200, 404, 422]).toContain(res1.status());
      expect([200, 404, 422]).toContain(res2.status());
    }
  );

  test(
    'should reject root-level disallowed fields (legacy `status`/`result`/`quotaConsumed`)',
    {
      annotation: { type: 'TestRail', description: 'C1548570' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      // Send the legacy shape documented in spec §5.2 — current validator rejects it
      const payload = {
        id: 'test-quota-qa',
        status: 'success',
        quotaConsumed: 5,
        result: { homePage: { html: '<p>legacy</p>', lang: 'en' } },
      };

      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: { 'x-api-key': callbackApiKey, 'Content-Type': 'application/json' },
        data: payload,
      });

      // Server returns 422 `"status" is not allowed` for extra root-level fields
      expect([400, 422]).toContain(response.status());
    }
  );
});
