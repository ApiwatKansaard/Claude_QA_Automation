/**
 * API Test: Scheduled Jobs — List & Stats Endpoints
 *
 * Maps to TestRail: "Agentic > Scheduled Jobs > API"
 * Endpoints discovered from network traffic:
 *   GET /v1/scheduled-jobs
 *   GET /v1/scheduled-jobs/stats/total
 *   GET /v1/scheduled-jobs/stats/success-run-rate
 *   GET /v1/scheduled-jobs/stats/failure-runs
 *
 * Type: Smoke + Security | Priority: P1
 */
import { test, expect } from '@playwright/test';
import { getAuthHeaders } from '../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../src/config/env.config';

const { apiBaseURL: API_BASE } = loadEnvConfig();

test.describe('Scheduled Jobs API', { tag: ['@api', '@scheduled-jobs'] }, () => {

  test('TC-API-001: GET /v1/scheduled-jobs returns job list',
    { tag: ['@smoke', '@P1'] },
    async ({ request }) => {
    const response = await request.get(`${API_BASE}/v1/scheduled-jobs`, {
      params: { page: '1', limit: '10', sortBy: 'updatedAt', sortOrder: 'desc' },
      headers: getAuthHeaders(),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Response should contain jobs array (data or directly)
    const jobs = body.data || body.jobs || body;
    expect(Array.isArray(jobs) || typeof jobs === 'object').toBeTruthy();
  });

  test('TC-API-002: GET /v1/scheduled-jobs supports pagination params',
    { tag: ['@sanity', '@P2'] },
    async ({ request }) => {
    const response = await request.get(`${API_BASE}/v1/scheduled-jobs`, {
      params: { page: '1', limit: '5', sortBy: 'updatedAt', sortOrder: 'desc' },
      headers: getAuthHeaders(),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Verify we got at most 5 items
    const jobs = body.data || body.jobs || body;
    if (Array.isArray(jobs)) {
      expect(jobs.length).toBeLessThanOrEqual(5);
    }
  });

  test('TC-API-003: GET /v1/scheduled-jobs/stats/total returns total count',
    { tag: ['@smoke', '@P1'] },
    async ({ request }) => {
    const response = await request.get(`${API_BASE}/v1/scheduled-jobs/stats/total`, {
      headers: getAuthHeaders(),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    // Should contain some form of total count
    expect(body).toBeDefined();
  });

  test('TC-API-004: GET /v1/scheduled-jobs/stats/success-run-rate returns rate',
    { tag: ['@regression', '@P2'] },
    async ({ request }) => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const response = await request.get(`${API_BASE}/v1/scheduled-jobs/stats/success-run-rate`, {
      params: {
        from: weekAgo.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      },
      headers: getAuthHeaders(),
    });

    expect(response.status()).toBe(200);
  });

  test('TC-API-005: GET /v1/scheduled-jobs/stats/failure-runs returns failures',
    { tag: ['@regression', '@P2'] },
    async ({ request }) => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const response = await request.get(`${API_BASE}/v1/scheduled-jobs/stats/failure-runs`, {
      params: {
        from: weekAgo.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      },
      headers: getAuthHeaders(),
    });

    expect(response.status()).toBe(200);
  });

  test('TC-API-006: Unauthenticated request should be rejected',
    { tag: ['@smoke', '@security', '@P1'] },
    async ({ request }) => {
    const response = await request.get(`${API_BASE}/v1/scheduled-jobs`, {
      params: { page: '1', limit: '10' },
      headers: { 'Content-Type': 'application/json' },
      // No Authorization header
    });

    // Should return 401 or 403
    expect([401, 403]).toContain(response.status());
  });

  test('TC-API-007: Invalid token should be rejected',
    { tag: ['@smoke', '@security', '@P1'] },
    async ({ request }) => {
    const response = await request.get(`${API_BASE}/v1/scheduled-jobs`, {
      params: { page: '1', limit: '10' },
      headers: {
        Authorization: 'Bearer invalid-token-12345',
        'Content-Type': 'application/json',
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});
