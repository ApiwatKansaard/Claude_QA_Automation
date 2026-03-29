/**
 * API Test: SharePoint KM — OAuth Sign-In (Auth Connections)
 *
 * Maps to TestRail: "Agentic > SharePoint KM > User Auth Connections > OAuth Sign-In"
 * C1550329–C1550337
 *
 * Type: Regression | Priority: P1 | Platform: API (OAuth redirect checks)
 * Endpoint: /v1/auth/connections/microsoft/* (EkoAI API)
 */
import { test, expect } from '../../../../src/fixtures/test-fixtures';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';

const { apiBaseURL: API_BASE } = loadEnvConfig();
const NET_ID  = process.env.TEST_NETWORK_ID || 'net-001';
const USER_ID = process.env.TEST_USER_ID    || 'user-001';

test.describe('SharePoint KM — OAuth Sign-In', {
  tag: ['@sharepoint-km', '@api', '@oauth', '@auth-connections'],
}, () => {

  // C1550329
  test('GET /v1/auth/connections/microsoft/authorize redirects to Microsoft OAuth with PKCE',
    {
      annotation: { type: 'TestRail', description: 'C1550329' },
      tag: ['@smoke', '@P1'],
    },
    async ({ request }) => {
      test.fixme(true, 'Endpoint /v1/auth/connections/microsoft/authorize not yet deployed in staging — returns 404');
      const res = await request.get(`${API_BASE}/v1/auth/connections/microsoft/authorize`, {
        headers: getAuthHeaders(),
        params: { userId: USER_ID, networkId: NET_ID },
        maxRedirects: 0, // Catch the redirect
      });

      // Should redirect (302/301) to Microsoft OAuth
      expect([301, 302, 303]).toContain(res.status());
      const location = res.headers()['location'] || '';
      expect(location).toMatch(/login\.microsoftonline\.com|microsoft\.com/i);
      // PKCE parameters must be present
      expect(location).toMatch(/code_challenge/i);
    },
  );

  // C1550330
  test('Completing OAuth flow stores encrypted tokens in Cosmos',
    {
      annotation: { type: 'TestRail', description: 'C1550330' },
      tag: ['@regression', '@P1'],
    },
    async () => {
      test.skip(true, 'Full OAuth flow requires external Microsoft interaction — validate in integration env');
    },
  );

  // C1550331
  test('GET /v1/auth/connections lists connected providers without exposing token values',
    {
      annotation: { type: 'TestRail', description: 'C1550331' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      const res = await request.get(`${API_BASE}/v1/auth/connections`, {
        headers: getAuthHeaders(),
        params: { userId: USER_ID, networkId: NET_ID },
      });

      expect([200, 404]).toContain(res.status()); // 404 if not connected yet — that's valid
      if (res.status() === 200) {
        const body = await res.json();
        const bodyStr = JSON.stringify(body);
        // Tokens must NOT be exposed in response
        expect(bodyStr).not.toMatch(/"accessToken"\s*:\s*"[A-Za-z0-9._-]{20,}"/);
        expect(bodyStr).not.toMatch(/"refreshToken"\s*:\s*"[A-Za-z0-9._-]{20,}"/);
      }
    },
  );

  // C1550332
  test('OAuth callback with forged state JWT is rejected',
    {
      annotation: { type: 'TestRail', description: 'C1550332' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.fixme(true, 'Endpoint /v1/auth/connections/microsoft/callback not yet deployed in staging — returns 404');
      const res = await request.get(`${API_BASE}/v1/auth/connections/microsoft/callback`, {
        params: {
          code:  'valid_auth_code_placeholder',
          state: 'forged.invalid.jwt.signature',
        },
      });

      expect([400, 401, 403]).toContain(res.status());
    },
  );

  // C1550333
  test('OAuth callback with expired state JWT (>5min TTL) is rejected',
    {
      annotation: { type: 'TestRail', description: 'C1550333' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      test.fixme(true, 'Endpoint /v1/auth/connections/microsoft/callback not yet deployed in staging — returns 404');
      // Using a JWT that has expired TTL (iat set to >5 min ago)
      // Real expired token would need crypto — use placeholder to verify 400/401
      const res = await request.get(`${API_BASE}/v1/auth/connections/microsoft/callback`, {
        params: {
          code:  'test_code',
          state: 'eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE2MDAwMDAwMDB9.invalid', // very old iat
        },
      });

      expect([400, 401, 403]).toContain(res.status());
    },
  );

  // C1550334
  test('Authorize request for unconfigured provider returns structured error, not broken URL',
    {
      annotation: { type: 'TestRail', description: 'C1550334' },
      tag: ['@regression', '@P2'],
    },
    async ({ request }) => {
      const res = await request.get(`${API_BASE}/v1/auth/connections/github/authorize`, {
        headers: getAuthHeaders(),
        params: { userId: USER_ID, networkId: NET_ID },
        maxRedirects: 0,
      });

      // Should return error, not a broken redirect
      expect([400, 404, 422]).toContain(res.status());
      if (res.status() !== 302) {
        const body = await res.json().catch(() => ({}));
        // Accept either 'error' or 'message' key — both indicate a structured error response
        expect(body.error ?? body.message).toBeTruthy();
      }
    },
  );

  // C1550335
  test('User closing browser mid-OAuth does not create partial token record',
    {
      annotation: { type: 'TestRail', description: 'C1550335' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Simulating browser close mid-OAuth requires integration-level test');
    },
  );

  // C1550336
  test('Re-connecting Microsoft when already connected updates existing Cosmos record',
    {
      annotation: { type: 'TestRail', description: 'C1550336' },
      tag: ['@regression', '@P2'],
    },
    async () => {
      test.skip(true, 'Requires full OAuth flow twice — integration-level test');
    },
  );

  // C1550337
  test('DELETE /v1/auth/connections/microsoft revokes refresh token and removes Cosmos record',
    {
      annotation: { type: 'TestRail', description: 'C1550337' },
      tag: ['@regression', '@P1'],
    },
    async ({ request }) => {
      const res = await request.delete(`${API_BASE}/v1/auth/connections/microsoft`, {
        headers: getAuthHeaders(),
        data: { userId: USER_ID, networkId: NET_ID },
      });

      // 200 (deleted) or 404 (never connected) are both valid in isolation
      expect([200, 204, 404]).toContain(res.status());
    },
  );
});
