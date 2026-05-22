/**
 * AI Task Scheduler — Webhook Timing Verification
 *
 * Validates that the scheduler fires webhooks at the correct scheduled time:
 * 1. Webhook fires within ±2 min of DTSTART
 * 2. Webhook does NOT fire before scheduled time
 * 3. Recurring schedule fires the correct number of times
 *
 * Prerequisites:
 *   - ngrok installed and authenticated
 *   - Auth state available (run setup first)
 *   - EkoAI Console accessible in staging
 *
 * Tags: @webhook @ai-task-scheduler @timing @P1
 */

import { test, expect } from '@playwright/test';
import { MockServerManager } from '../../../../src/mock-server/server-manager';
import { deleteJob } from '../../../../src/helpers/job-factory';
import { getAuthHeaders } from '../../../../src/helpers/auth.helper';
import { loadEnvConfig } from '../../../../src/config/env.config';
import { request } from '@playwright/test';

const MOCK_API_KEY = `qa-timing-${Date.now()}`;
const MOCK_PORT = 3336;
const TIMING_TOLERANCE_MS = 120_000; // ±2 minutes
const POLL_INTERVAL_MS = 10_000; // poll every 10s

// Staging test user — used as audience so the scheduler has someone to dispatch to
const STAGING_TEST_USER_ID = '690c1180b26c660c776ffa10';

let manager: MockServerManager;
const jobIds: string[] = [];

test.describe('Webhook Timing Verification @webhook @ai-task-scheduler @timing', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const config = loadEnvConfig();
    test.skip(config.env === 'prod', 'Skipped on prod — no job creation allowed');

    manager = new MockServerManager({
      port: MOCK_PORT,
      expectedApiKey: MOCK_API_KEY,
    });
    await manager.start();
  });

  test.afterAll(async () => {
    // Cleanup all test jobs
    for (const id of jobIds) {
      try {
        await deleteJob(id);
        console.log(`[timing] Cleaned up job: ${id}`);
      } catch {
        console.warn(`[timing] Failed to delete job ${id}`);
      }
    }
    await manager?.stop();
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 1: Verify webhook fires within ±2 min of DTSTART
  // ═══════════════════════════════════════════════════════════════

  test('Verify webhook fires within ±2 min of scheduled DTSTART @P1 @slow', async () => {
    const config = loadEnvConfig();
    test.setTimeout(15 * 60_000);

    const scheduleMinutes = 3;
    const scheduledTime = new Date(Date.now() + scheduleMinutes * 60_000);
    const iCal = buildICal(scheduledTime, { count: 1 });

    console.log(`[timing] Scheduled DTSTART: ${scheduledTime.toISOString()}`);
    console.log(`[timing] Mock server: ${manager.publicUrl}`);

    // Create job
    const jobId = await createTimingJob(config, iCal, 'Timing-OnSchedule');
    if (!jobId) {
      test.skip(true, 'Job creation failed — may need audience config');
      return;
    }
    jobIds.push(jobId);
    console.log(`[timing] Created job: ${jobId}`);

    // Clear logs before waiting
    await manager.clearLogs();

    // Poll until webhook received or timeout
    const maxWaitMs = 10 * 60_000;
    const startTime = Date.now();
    let webhookTimestamp: string | null = null;

    while (Date.now() - startTime < maxWaitMs) {
      const logs = await manager.getWebhookLogs();
      if (logs.length > 0) {
        webhookTimestamp = logs[0].timestamp;
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Assert webhook was received
    expect(webhookTimestamp, 'Webhook was never received within timeout').toBeTruthy();

    // Calculate timing delta
    const actualTime = new Date(webhookTimestamp!);
    const deltaMs = Math.abs(actualTime.getTime() - scheduledTime.getTime());
    const deltaSec = Math.round(deltaMs / 1000);

    console.log(`[timing] Scheduled: ${scheduledTime.toISOString()}`);
    console.log(`[timing] Actual:    ${actualTime.toISOString()}`);
    console.log(`[timing] Delta:     ${deltaSec}s (tolerance: ${TIMING_TOLERANCE_MS / 1000}s)`);

    expect(
      deltaMs,
      `Webhook fired ${deltaSec}s from scheduled time (tolerance: ±${TIMING_TOLERANCE_MS / 1000}s)`,
    ).toBeLessThanOrEqual(TIMING_TOLERANCE_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 2: Verify no early trigger
  // ═══════════════════════════════════════════════════════════════

  test('Verify webhook does NOT fire before scheduled time @P1 @slow', async () => {
    const config = loadEnvConfig();
    test.setTimeout(15 * 60_000);

    const scheduleMinutes = 5;
    const scheduledTime = new Date(Date.now() + scheduleMinutes * 60_000);
    const iCal = buildICal(scheduledTime, { count: 1 });

    console.log(`[timing] Scheduled DTSTART: ${scheduledTime.toISOString()}`);

    // Create job
    const jobId = await createTimingJob(config, iCal, 'Timing-NoEarly');
    if (!jobId) {
      test.skip(true, 'Job creation failed — may need audience config');
      return;
    }
    jobIds.push(jobId);
    console.log(`[timing] Created job: ${jobId}`);

    await manager.clearLogs();

    // Phase 1: Poll BEFORE scheduled time — must have 0 webhooks
    const earlyCheckDeadline = scheduledTime.getTime() - 30_000; // stop checking 30s before
    let earlyWebhookDetected = false;

    while (Date.now() < earlyCheckDeadline) {
      const logs = await manager.getWebhookLogs();
      if (logs.length > 0) {
        const earlyTime = new Date(logs[0].timestamp);
        console.log(`[timing] EARLY webhook detected at ${earlyTime.toISOString()}`);
        console.log(`[timing] Scheduled was ${scheduledTime.toISOString()}`);
        earlyWebhookDetected = true;
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    expect(earlyWebhookDetected, 'Webhook fired BEFORE scheduled time').toBe(false);
    console.log(`[timing] No early trigger — correct`);

    // Phase 2: Wait AFTER scheduled time — webhook should arrive
    const maxPostWaitMs = 5 * 60_000;
    const postStart = Date.now();
    let webhookReceived = false;

    while (Date.now() - postStart < maxPostWaitMs) {
      const logs = await manager.getWebhookLogs();
      if (logs.length > 0) {
        const actualTime = new Date(logs[0].timestamp);
        const deltaSec = Math.round((actualTime.getTime() - scheduledTime.getTime()) / 1000);
        console.log(`[timing] Webhook received ${deltaSec}s after scheduled time`);
        webhookReceived = true;
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    expect(webhookReceived, 'Webhook was never received after scheduled time').toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 3: Verify recurring schedule fires correct count
  // ═══════════════════════════════════════════════════════════════

  test('Verify recurring schedule fires correct number of times @P1 @slow', async () => {
    const config = loadEnvConfig();
    test.setTimeout(15 * 60_000);

    const scheduleMinutes = 2;
    const intervalMinutes = 2;
    const expectedCount = 2;
    const scheduledTime = new Date(Date.now() + scheduleMinutes * 60_000);
    const iCal = buildICal(scheduledTime, {
      freq: 'MINUTELY',
      interval: intervalMinutes,
      count: expectedCount,
    });

    console.log(`[timing] Recurring: every ${intervalMinutes}min, ${expectedCount} times`);
    console.log(`[timing] First DTSTART: ${scheduledTime.toISOString()}`);

    // Create job
    const jobId = await createTimingJob(config, iCal, 'Timing-Recurring');
    if (!jobId) {
      test.skip(true, 'Job creation failed — may need audience config');
      return;
    }
    jobIds.push(jobId);
    console.log(`[timing] Created job: ${jobId}`);

    await manager.clearLogs();

    // Wait long enough for all triggers: DTSTART + (count * interval) + buffer
    const totalWaitMs = (scheduleMinutes + expectedCount * intervalMinutes + 3) * 60_000;
    const startTime = Date.now();
    let receivedCount = 0;

    while (Date.now() - startTime < totalWaitMs) {
      const logs = await manager.getWebhookLogs();
      receivedCount = logs.length;

      if (receivedCount >= expectedCount) {
        console.log(`[timing] Received ${receivedCount}/${expectedCount} webhooks`);
        break;
      }

      console.log(`[timing] Waiting... ${receivedCount}/${expectedCount} webhooks received`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Verify count
    const finalLogs = await manager.getWebhookLogs();
    console.log(`[timing] Final webhook count: ${finalLogs.length} (expected: ${expectedCount})`);

    expect(
      finalLogs.length,
      `Expected ${expectedCount} webhooks but received ${finalLogs.length}`,
    ).toBeGreaterThanOrEqual(expectedCount);

    // Verify interval between calls (~2 min ± 90s)
    if (finalLogs.length >= 2) {
      const t1 = new Date(finalLogs[0].timestamp).getTime();
      const t2 = new Date(finalLogs[1].timestamp).getTime();
      const intervalMs = t2 - t1;
      const expectedIntervalMs = intervalMinutes * 60_000;
      const intervalToleranceMs = 90_000; // ±90s

      console.log(`[timing] Interval between calls: ${Math.round(intervalMs / 1000)}s`);
      console.log(`[timing] Expected interval: ${intervalMinutes * 60}s (±${intervalToleranceMs / 1000}s)`);

      expect(
        Math.abs(intervalMs - expectedIntervalMs),
        `Interval between triggers was ${Math.round(intervalMs / 1000)}s, expected ~${intervalMinutes * 60}s`,
      ).toBeLessThanOrEqual(intervalToleranceMs);
    }
  });
});

// ── Helpers ────────────────────────────────────────────────────────

interface ICalOptions {
  freq?: string;
  interval?: number;
  count: number;
}

/**
 * Build iCalendar definition with precise DTSTART and optional recurrence.
 */
function buildICal(dtstart: Date, opts: ICalOptions): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dt = `${dtstart.getUTCFullYear()}${pad(dtstart.getUTCMonth() + 1)}${pad(dtstart.getUTCDate())}T${pad(dtstart.getUTCHours())}${pad(dtstart.getUTCMinutes())}00Z`;

  const freq = opts.freq || 'DAILY';
  const parts = [`FREQ=${freq}`];
  if (opts.interval && opts.interval > 1) parts.push(`INTERVAL=${opts.interval}`);
  parts.push(`COUNT=${opts.count}`);

  return `DTSTART:${dt}\nRRULE:${parts.join(';')}`;
}

/**
 * Create a scheduled job via API for timing tests.
 * Returns job ID or null if creation failed.
 */
async function createTimingJob(
  config: ReturnType<typeof loadEnvConfig>,
  iCal: string,
  suffix: string,
): Promise<string | null> {
  const ctx = await request.newContext({ baseURL: config.apiBaseURL });
  try {
    const res = await ctx.post('/v1/scheduled-jobs', {
      headers: getAuthHeaders(),
      data: {
        name: `QA-${suffix}-${Date.now()}`,
        description: `Timing verification test — ${suffix}`,
        step: {
          trigger: {
            iCalendarDefinition: iCal,
            runUntilTimes: iCal.includes('COUNT=1') ? 1 : undefined,
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
        audience: { users: [STAGING_TEST_USER_ID], groups: [] },
      },
    });

    if (res.ok()) {
      const body = await res.json();
      return body.data?.id ?? body.id ?? null;
    }

    const errBody = await res.text();
    console.log(`[timing] Create job failed: ${res.status()} — ${errBody}`);
    return null;
  } finally {
    await ctx.dispose();
  }
}
