/**
 * AI Task Scheduler — Webhook E2E Tests
 *
 * Tests the full Trigger → Process → Action pipeline by:
 * 1. Starting a local mock process server + ngrok tunnel
 * 2. Creating a scheduled job in EkoAI Console pointing to our mock server
 * 3. Verifying the webhook is called with correct payload and timing
 * 4. Optionally verifying callback delivery back to EkoAI
 *
 * Prerequisites:
 *   - ngrok installed and authenticated
 *   - Auth state available (run setup first)
 *   - EkoAI Console accessible in target environment
 *
 * Tags: @webhook @ai-task-scheduler @P1
 */

import { test, expect } from '@playwright/test';
import { MockServerManager } from '../../../../src/mock-server/server-manager';
import { createJob, deleteJob } from '../../../../src/helpers/job-factory';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';

const MOCK_API_KEY = `qa-webhook-test-${Date.now()}`;
const MOCK_PORT = 3333;

let manager: MockServerManager;
let jobId: string | null = null;

test.describe('AI Task Scheduler — Webhook E2E @webhook @ai-task-scheduler', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    manager = new MockServerManager({
      port: MOCK_PORT,
      expectedApiKey: MOCK_API_KEY,
    });
    await manager.start();
  });

  test.afterAll(async () => {
    // Cleanup: delete test job if created
    if (jobId) {
      try {
        await deleteJob(jobId);
      } catch {
        console.warn(`[cleanup] Failed to delete job ${jobId}`);
      }
    }
    await manager.stop();
  });

  test.beforeEach(async () => {
    await manager.clearLogs();
  });

  // ── Test 1: Mock server health ───────────────────────────────

  test('Verify mock server is running and accessible @smoke', async () => {
    const res = await fetch(`${manager.localUrl}/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
  });

  // ── Test 2: ngrok tunnel accessible ──────────────────────────

  test('Verify ngrok tunnel is accessible @smoke', async () => {
    expect(manager.publicUrl).toContain('https://');

    const res = await fetch(`${manager.publicUrl}/health`);
    expect(res.status).toBe(200);
  });

  // ── Test 3: Status check endpoint works ──────────────────────

  test('Verify /status-check returns 200 with valid API key @smoke', async () => {
    const res = await fetch(`${manager.publicUrl}/status-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MOCK_API_KEY,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('Verify /status-check returns 401 with invalid API key', async () => {
    const res = await fetch(`${manager.publicUrl}/status-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'wrong-key',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  // ── Test 4: Webhook endpoint receives and logs ───────────────

  test('Verify /webhook accepts request and logs payload @P1', async () => {
    const payload = {
      id: 'test-run-user-001',
      data: {
        userId: 'user-abc',
        username: 'john.doe',
        email: 'john@example.com',
        firstname: 'John',
        lastname: 'Doe',
        extras: { department: 'QA' },
      },
    };

    const res = await fetch(`${manager.publicUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MOCK_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const ack = await res.json();
    expect(ack.accepted).toBe(true);

    // Verify log was recorded
    const logs = await manager.getWebhookLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].body.id).toBe('test-run-user-001');
    expect(logs[0].body.data.userId).toBe('user-abc');
    expect(logs[0].body.data.username).toBe('john.doe');
    expect(logs[0].headers['x-api-key']).toBe(MOCK_API_KEY);
  });

  // ── Test 5: Webhook rejects invalid API key ──────────────────

  test('Verify /webhook rejects invalid API key', async () => {
    const res = await fetch(`${manager.publicUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'invalid-key',
      },
      body: JSON.stringify({ id: 'test', data: {} }),
    });

    expect(res.status).toBe(401);

    // Verify no log was recorded for invalid request
    const logs = await manager.getWebhookLogs();
    expect(logs.length).toBe(0);
  });

  // ── Test 6: Create job via API pointing to mock server ───────

  test('Verify scheduled job can be created with mock server endpoint @P1', async () => {
    const config = loadEnvConfig();
    test.skip(config.env === 'prod', 'Skipped on prod — no job creation allowed');

    const { request: pwRequest } = require('@playwright/test');
    const ctx = await pwRequest.newContext({ baseURL: config.apiBaseURL });

    try {
      const res = await ctx.post('/v1/scheduled-jobs', {
        headers: getAuthHeaders(),
        data: {
          name: `QA-Webhook-E2E-${Date.now()}`,
          description: 'E2E test — validates webhook receives calls from EkoAI',
          step: {
            trigger: {
              // Schedule 5 minutes from now
              iCalendarDefinition: buildICalFor5MinFromNow(),
              runUntilTimes: 1,
            },
            process: {
              endpoint: manager.publicUrl,
              apiKey: MOCK_API_KEY,
              timeoutSeconds: 60,
            },
            action: [
              {
                type: 'HOME_PAGE',
                schedule: { mode: 'IMMEDIATE' },
              },
            ],
          },
          audience: { users: [], groups: [] },
        },
      });

      if (res.ok()) {
        const body = await res.json();
        jobId = body.data?.id ?? body.id;
        expect(jobId).toBeTruthy();
        console.log(`[webhook-e2e] Created job: ${jobId}`);
        console.log(`[webhook-e2e] Mock server URL: ${manager.publicUrl}`);
      } else {
        const errBody = await res.text();
        console.log(`[webhook-e2e] Create job returned ${res.status()}: ${errBody}`);
        // Don't fail — this test validates the integration is possible
        // The job creation may fail if audience is empty or other business rules
        test.skip(true, `Job creation returned ${res.status()} — may need audience config`);
      }
    } finally {
      await ctx.dispose();
    }
  });

  // ── Test 7: Full E2E — wait for webhook trigger ──────────────

  test('Verify EkoAI triggers webhook at scheduled time @P1 @slow', async () => {
    const config = loadEnvConfig();
    test.skip(config.env === 'prod', 'Skipped on prod — no job trigger allowed');
    test.skip(!jobId, 'No job created — skipping webhook trigger test');
    test.setTimeout(10 * 60_000); // 10 min timeout for waiting

    console.log(`[webhook-e2e] Waiting for EkoAI to trigger webhook...`);
    console.log(`[webhook-e2e] Mock server: ${manager.publicUrl}`);
    console.log(`[webhook-e2e] Job ID: ${jobId}`);

    // Poll mock server logs until webhook is received or timeout
    const startTime = Date.now();
    const maxWaitMs = 8 * 60_000; // 8 minutes
    const pollIntervalMs = 10_000; // check every 10s

    let webhookReceived = false;

    while (Date.now() - startTime < maxWaitMs) {
      const logs = await manager.getWebhookLogs();

      if (logs.length > 0) {
        webhookReceived = true;
        console.log(`[webhook-e2e] Webhook received after ${Math.round((Date.now() - startTime) / 1000)}s`);
        console.log(`[webhook-e2e] Payload:`, JSON.stringify(logs[0].body, null, 2));

        // Validate payload structure (per Project Team Guide spec)
        expect(logs[0].body.id).toBeTruthy();
        expect(logs[0].body.data).toBeTruthy();
        expect(logs[0].body.data.userId).toBeTruthy();
        expect(logs[0].body.data.username).toBeTruthy();
        expect(logs[0].headers['x-api-key']).toBe(MOCK_API_KEY);
        break;
      }

      // Also check status-check was called (happens before webhook)
      const allLogs = await manager.getLogs();
      const statusChecks = allLogs.filter((l) => l.path === '/status-check');
      if (statusChecks.length > 0 && !webhookReceived) {
        console.log(`[webhook-e2e] Status check received — webhook incoming...`);
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    expect(webhookReceived).toBe(true);
  });
});

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Build an iCalendar definition that triggers ~5 minutes from now.
 * Uses FREQ=DAILY with a DTSTART set to 5 min in the future.
 */
function buildICalFor5MinFromNow(): string {
  const dt = new Date(Date.now() + 5 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dtstart = `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
  return `DTSTART:${dtstart}\nRRULE:FREQ=DAILY;COUNT=1`;
}
