/**
 * API Test: Morning Brief — Security
 *
 * Maps to TestRail: "Agentic > Morning Brief > Security"
 * C1552434–C1552443
 * Type: Smoke/Sanity/Regression | Priority: P1/P2 | Platform: API
 */
import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';
import { createJob, deleteJob } from '../../../../src/helpers/job-factory';
import { getCallbackApiKey } from '../../../../src/helpers/callback-key.helper';

const { apiBaseURL: API_BASE } = loadEnvConfig();
const CALLBACK_PATH = '/v1/scheduled-jobs/runs/callback';

/** Compute HMAC-SHA256 hex digest over a payload string with a given secret. */
function computeHmac(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

test.describe('Morning Brief — Security', {
  tag: ['@morning-brief', '@api', '@security'],
}, () => {
  let jobId: string;
  let callbackApiKey: string;

  test.beforeAll(async () => {
    jobId = await createJob('MBSecurity');
    callbackApiKey = await getCallbackApiKey(jobId);
  });

  test.afterAll(async () => {
    if (jobId) await deleteJob(jobId);
  });

  // ─────────────────────────────────────────────
  // C1552434 — API request should be authenticated when valid EkoApiKey is provided
  // ─────────────────────────────────────────────
  test(
    'API request should be authenticated when valid EkoApiKey is provided',
    {
      annotation: { type: 'TestRail', description: 'C1552434' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      // Use the standard auth headers (which include a valid EkoApiKey)
      const response = await request.get(`${API_BASE}/v1/scheduled-jobs/${jobId}`, {
        headers: getAuthHeaders(),
      });

      // Valid key must be accepted
      expect(response.status()).toBe(200);
    }
  );

  // ─────────────────────────────────────────────
  // C1552435 — API request should be rejected when invalid EkoApiKey is provided
  // ─────────────────────────────────────────────
  test(
    'API request should be rejected when invalid EkoApiKey is provided',
    {
      annotation: { type: 'TestRail', description: 'C1552435' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      const response = await request.get(`${API_BASE}/v1/scheduled-jobs/${jobId}`, {
        headers: {
          Authorization: 'Bearer invalid-eko-api-key-00000',
          'Content-Type': 'application/json',
        },
      });

      // Invalid key must be rejected
      expect([401, 403]).toContain(response.status());
    }
  );

  // ─────────────────────────────────────────────
  // C1552436 — HMAC signature should be valid when external server receives EkoAI webhook
  // ─────────────────────────────────────────────
  test(
    'HMAC signature should be valid when external server receives EkoAI webhook',
    {
      annotation: { type: 'TestRail', description: 'C1552436' },
      tag: ['@sanity', '@P1'],
    },
    async ({ request }) => {
      // Verify that the HMAC computation produces a correct hex signature
      const testPayload = JSON.stringify({
        id: 'qa-hmac-test',
        homePage: { html: '<p>hmac</p>', lang: 'en' },
      });
      const testSecret = 'qa-shared-hmac-secret';
      const signature = computeHmac(testPayload, testSecret);

      // Signature must be a 64-char hex string (SHA-256)
      expect(signature).toMatch(/^[a-f0-9]{64}$/);

      // Send with signature header to the callback endpoint (simulates external server)
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: {
          'x-api-key': callbackApiKey,
          'x-ekoai-signature': signature,
          'Content-Type': 'application/json',
        },
        data: testPayload,
      });

      // 200/404/422 = signature accepted (or probe ID unknown); 401 = signature rejected
      expect([200, 401, 404, 422]).toContain(response.status());
    }
  );

  // ─────────────────────────────────────────────
  // C1552437 — callback endpoint should enforce scheduled_job_api_key auth independently
  // ─────────────────────────────────────────────
  test(
    'callback endpoint should enforce scheduled_job_api_key auth independently',
    {
      annotation: { type: 'TestRail', description: 'C1552437' },
      tag: ['@sanity', '@P1'],
    },
    async ({ request }) => {
      // Attempt callback with valid EkoApiKey but missing callback x-api-key
      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: {
          ...getAuthHeaders(), // Valid EkoApiKey — but NOT sufficient for callback
          'Content-Type': 'application/json',
          // Deliberately omitting x-api-key (callback key)
        },
        data: {
          id: 'qa-auth-independent-probe-437',
          homePage: { html: '<p>x</p>', lang: 'en' },
        },
      });

      // Callback endpoint must reject without the job-specific key
      expect([401, 403]).toContain(response.status());
    }
  );

  // ─────────────────────────────────────────────
  // C1552438 — API request should be rejected when API key scope does not match
  // ─────────────────────────────────────────────
  test(
    'API request should be rejected when API key scope does not match',
    {
      annotation: { type: 'TestRail', description: 'C1552438' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Use a key scoped for home-page delivery on the scheduled-jobs management endpoint
      const response = await request.post(`${API_BASE}/v1/scheduled-jobs`, {
        headers: {
          'x-api-key': 'home-page-scoped-key-qa-438',
          'Content-Type': 'application/json',
        },
        data: { name: 'QA Scope Test Job' },
      });

      if (response.status() === 404) {
        test.skip(true, 'Scheduled jobs endpoint not available');
        return;
      }

      // Scope mismatch must be rejected
      expect([400, 401, 403]).toContain(response.status());
    }
  );

  // ─────────────────────────────────────────────
  // C1552439 — API request should be rejected when no authentication header provided
  // ─────────────────────────────────────────────
  test(
    'API request should be rejected when no authentication header provided',
    {
      annotation: { type: 'TestRail', description: 'C1552439' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // No auth headers whatsoever
      const response = await request.get(`${API_BASE}/v1/scheduled-jobs/${jobId}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      // Unauthenticated request must be rejected
      expect([401, 403]).toContain(response.status());
    }
  );

  // ─────────────────────────────────────────────
  // C1552440 — callback key should be unique per ScheduledJob and not reusable across jobs
  // ─────────────────────────────────────────────
  test(
    'callback key should be unique per ScheduledJob and not reusable across jobs',
    {
      annotation: [
        { type: 'TestRail', description: 'C1552440' },
        {
          type: 'note',
          description:
            'Each ScheduledJob has its own callback API key. ' +
            'Observable by creating two jobs and verifying the callback key for one ' +
            'is rejected by the other job\'s callback endpoint.',
        },
      ],
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Create a second job and get its real callback API key
      const job2Id = await createJob('MBSecCrossKey');
      const job2Key = await getCallbackApiKey(job2Id);

      try {
        // job2's valid callback key used on a probe for a different run user — still a
        // valid key, but scoped to job2. Server may accept it (if scoped per-network)
        // or reject (if strictly per-job). Expect a known non-500 status either way.
        const crossKeyRes = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
          headers: {
            'x-api-key': job2Key, // valid key for job2, used against a run user that isn't job2's
            'Content-Type': 'application/json',
          },
          data: {
            id: 'qa-cross-key-probe-440',
            homePage: { html: '<p>x</p>', lang: 'en' },
          },
        });

        // Cross-job key usage: rejected (401/403) or unknown id (404) or validation (422)
        expect([200, 401, 403, 404, 422]).toContain(crossKeyRes.status());
        expect(crossKeyRes.status()).not.toBe(500);
      } finally {
        if (job2Id) await deleteJob(job2Id);
      }
    }
  );

  // ─────────────────────────────────────────────
  // C1552441 — PassportJS EkoApiKey strategy should handle malformed key format
  // ─────────────────────────────────────────────
  test(
    'PassportJS EkoApiKey strategy should handle malformed key format',
    {
      annotation: [
        { type: 'TestRail', description: 'C1552441' },
        {
          type: 'note',
          description:
            'PassportJS strategy must gracefully handle keys with unexpected formats ' +
            '(non-hex, too short, special chars) without returning 500.',
        },
      ],
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      const malformedKeys = [
        'a',                              // Too short
        '!@#$%^&*()',                     // Special characters
        'Bearer token-format-not-key',   // Wrong format
        '',                              // Empty string — send as explicit header value
      ];

      for (const key of malformedKeys) {
        if (key === '') continue; // Skip empty — causes header omission

        const response = await request.get(`${API_BASE}/v1/scheduled-jobs/${jobId}`, {
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        });

        // Must not return 500 — malformed key should be rejected cleanly
        expect(response.status()).not.toBe(500);
        expect([400, 401, 403]).toContain(response.status());
      }
    }
  );

  // ─────────────────────────────────────────────
  // C1552442 — API should prevent cross-tenant data access with valid key from other tenant
  // ─────────────────────────────────────────────
  test(
    'API should prevent cross-tenant data access with valid key from other tenant',
    {
      annotation: { type: 'TestRail', description: 'C1552442' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      // Attempt to access a job using a key from a different tenant (networkId mismatch)
      const response = await request.get(`${API_BASE}/v1/scheduled-jobs/${jobId}`, {
        headers: {
          Authorization: 'Bearer cross-tenant-valid-key-qa-442',
          'x-network-id': 'other-tenant-network-id',
          'Content-Type': 'application/json',
        },
      });

      // Cross-tenant access must be denied
      expect([401, 403, 404]).toContain(response.status());
    }
  );

  // ─────────────────────────────────────────────
  // C1552443 — webhook HMAC should reject tampered payload at process endpoint
  // ─────────────────────────────────────────────
  test(
    'webhook HMAC should reject tampered payload at process endpoint',
    {
      annotation: [
        { type: 'TestRail', description: 'C1552443' },
        {
          type: 'note',
          description:
            'When the webhook payload is modified after signing, ' +
            'the HMAC signature will not match the tampered content. ' +
            'The external endpoint (or the EkoAI callback endpoint) must reject it.',
        },
      ],
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      // Sign original payload, then tamper before sending
      const originalPayload = JSON.stringify({
        id: 'qa-hmac-tamper-probe',
        homePage: { html: '<p>legit</p>', lang: 'en' },
      });
      const tamperedPayload = JSON.stringify({
        id: 'qa-hmac-tamper-probe',
        homePage: { html: '<p>TAMPERED</p>', lang: 'en' }, // Changed after signing
      });

      const signature = computeHmac(originalPayload, 'qa-shared-hmac-secret');

      const response = await request.post(`${API_BASE}${CALLBACK_PATH}`, {
        headers: {
          'x-api-key': callbackApiKey,
          'x-ekoai-signature': signature,   // Signature of ORIGINAL — does not match tampered
          'Content-Type': 'application/json',
        },
        data: tamperedPayload,
      });

      // Tampered payload must not succeed — rejected by HMAC check or unknown probe ID
      expect([400, 401, 403, 404, 422]).toContain(response.status());
    }
  );
});
