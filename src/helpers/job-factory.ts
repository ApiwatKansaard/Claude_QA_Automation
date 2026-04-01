import { request } from '@playwright/test';
import { getAuthHeaders } from './auth.helper';
import { loadEnvConfig } from '../config/env.config';

/**
 * Minimal valid payload for creating a scheduled job via API.
 * Mirrors the payload used in scheduled-jobs-crud.api.spec.ts.
 */
function buildJobPayload(suffix: string) {
  return {
    name: `QA-Fixture-${suffix}-${Date.now()}`,
    description: 'Auto-created by QA test fixture — will be deleted after suite',
    step: {
      trigger: {
        iCalendarDefinition: 'DTSTART:20260401T060000Z\nRRULE:BYHOUR=6;BYMINUTE=0;FREQ=DAILY',
      },
      process: {
        endpoint: 'https://example.com/qa-noop',
        apiKey: 'qa-test-key',
        timeoutSeconds: 30,
      },
      action: [
        {
          type: 'HOME_PAGE',
          schedule: { mode: 'IMMEDIATE' },
        },
      ],
    },
    audience: { users: [], groups: [] },
  };
}

/**
 * Create a scheduled job via API and return its ID.
 * Call in beforeAll — does not require any Playwright fixture.
 */
export async function createJob(suffix = 'Fixture'): Promise<string> {
  const config = loadEnvConfig();
  const ctx = await request.newContext({ baseURL: config.apiBaseURL });
  try {
    const res = await ctx.post('/v1/scheduled-jobs', {
      headers: getAuthHeaders(),
      data: buildJobPayload(suffix),
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`createJob failed: ${res.status()} — ${body}`);
    }
    const body = await res.json();
    const id: string | undefined = body.data?.id ?? body.id;
    if (!id) throw new Error(`createJob: no ID in response — ${JSON.stringify(body)}`);
    return String(id);
  } finally {
    await ctx.dispose();
  }
}

/**
 * Find the first scheduled job that has run history.
 * Returns the job ID, or null if no job with history exists.
 * Useful for History Log and Widget Rendering tests that need real run data.
 *
 * Dynamic per environment — no hardcoded job IDs.
 */
export async function findJobWithHistory(): Promise<string | null> {
  const config = loadEnvConfig();
  const ctx = await request.newContext({ baseURL: config.apiBaseURL });
  try {
    // Get list of jobs
    const res = await ctx.get('/v1/scheduled-jobs', {
      headers: getAuthHeaders(),
    });
    if (!res.ok()) return null;

    const body = await res.json();
    const jobs: any[] = body.data ?? body.items ?? body ?? [];

    // Find a job that has at least 1 run (totalRun > 0 or lastRun exists)
    for (const job of jobs) {
      const id = job.id ?? job._id;
      if (!id) continue;

      // Check if the job has run history
      const hasRuns = (job.totalRun ?? 0) > 0
        || job.lastRun != null
        || job.lastRunAt != null
        || job.status === 'completed';

      if (hasRuns) return String(id);

      // Fallback: check the runs endpoint directly
      try {
        const runsRes = await ctx.get(`/v1/scheduled-jobs/${id}/runs`, {
          headers: getAuthHeaders(),
        });
        if (runsRes.ok()) {
          const runsBody = await runsRes.json();
          const runs = runsBody.data ?? runsBody.items ?? runsBody ?? [];
          if (Array.isArray(runs) && runs.length > 0) return String(id);
        }
      } catch { /* skip this job */ }
    }

    return null;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Delete a scheduled job by ID via API.
 * Call in afterAll for cleanup — ignores 404 (already deleted).
 */
export async function deleteJob(jobId: string): Promise<void> {
  const config = loadEnvConfig();
  const ctx = await request.newContext({ baseURL: config.apiBaseURL });
  try {
    const res = await ctx.delete(`/v1/scheduled-jobs/${jobId}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok() && res.status() !== 404) {
      console.warn(`[job-factory] deleteJob(${jobId}) returned ${res.status()}`);
    }
  } finally {
    await ctx.dispose();
  }
}
