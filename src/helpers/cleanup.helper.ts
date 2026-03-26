import { request as pwRequest } from '@playwright/test';
import { getAuthHeaders } from './auth.helper';
import { loadEnvConfig } from '../config/env.config';

/**
 * Test data cleanup helper.
 *
 * Collects resource IDs created during a test and deletes them via API
 * when dispose() is called. Use in afterEach/afterAll or via the
 * `cleanup` fixture (recommended).
 *
 * Usage with fixture (auto-cleanup after each test):
 *   import { test } from '../../fixtures';
 *   test('creates a job', async ({ cleanup, request }) => {
 *     const res = await request.post(...);
 *     const { id } = (await res.json()).data;
 *     cleanup.track('scheduled-job', id);
 *   }); // ← cleanup.dispose() called automatically
 *
 * Supported resource types and their DELETE endpoints:
 *   'scheduled-job' → DELETE /v1/scheduled-jobs/:id
 *
 * Add new types by extending RESOURCE_ENDPOINTS below.
 */

type ResourceType = 'scheduled-job';

const RESOURCE_ENDPOINTS: Record<ResourceType, (id: string) => string> = {
  'scheduled-job': (id) => `/v1/scheduled-jobs/${id}`,
};

interface TrackedResource {
  type: ResourceType;
  id: string;
}

export class CleanupHelper {
  private tracked: TrackedResource[] = [];

  /** Register a resource for cleanup after the test finishes. */
  track(type: ResourceType, id: string): void {
    this.tracked.push({ type, id });
  }

  /** Delete all tracked resources (LIFO order). Call in afterEach or let the fixture handle it. */
  async dispose(): Promise<void> {
    if (this.tracked.length === 0) return;

    const config = loadEnvConfig();
    const headers = getAuthHeaders();

    // Create a standalone API context for cleanup (works even if test's request is gone)
    const context = await pwRequest.newContext({
      baseURL: config.apiBaseURL,
      extraHTTPHeaders: headers,
    });

    // Delete in reverse order (LIFO) — child resources before parents
    const toDelete = [...this.tracked].reverse();
    const errors: string[] = [];

    for (const { type, id } of toDelete) {
      const endpoint = RESOURCE_ENDPOINTS[type];
      if (!endpoint) {
        errors.push(`Unknown resource type: ${type}`);
        continue;
      }

      try {
        const url = endpoint(id);
        const response = await context.delete(url);
        if (!response.ok() && response.status() !== 404) {
          errors.push(`Failed to delete ${type}/${id}: ${response.status()}`);
        }
      } catch (e) {
        errors.push(`Error deleting ${type}/${id}: ${e}`);
      }
    }

    await context.dispose();
    this.tracked = [];

    if (errors.length > 0) {
      console.warn(`[Cleanup] ${errors.length} error(s):\n  ${errors.join('\n  ')}`);
    }
  }
}
