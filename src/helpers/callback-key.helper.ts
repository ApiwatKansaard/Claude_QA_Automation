/**
 * Helper for obtaining the scheduled_job_callback_api_key.
 *
 * Per spec [Doc] Project Team Guide | Scheduled Job (Confluence 3528917005, §5.1):
 *   > "The key provides basic authorization for a scheduled job. It can be obtained
 *   >  by accessing the Edit Scheduled Job interface (Get API Key button within
 *   >  the Process Step). The API Key for callback is available in the interface
 *   >  only once when it is generated."
 *
 * In automation, we call the generation endpoint directly to obtain a fresh key
 * every test run. The generated key has the `scbk_` prefix.
 *
 * Endpoint:  POST /v1/scheduled-jobs/{jobId}/callback-api-key
 * Auth:      Bearer <idToken>
 * Response:  { apiKey: "scbk_<uuid>" }
 */
import { request } from '@playwright/test';
import { getAuthHeaders } from './auth.helper';
import { loadEnvConfig } from '../config/env.config';

/**
 * Generate a fresh callback API key for a scheduled job.
 * Call after createJob() and before any callback POST.
 */
export async function getCallbackApiKey(jobId: string): Promise<string> {
  const config = loadEnvConfig();
  const ctx = await request.newContext({ baseURL: config.apiBaseURL });
  try {
    const res = await ctx.post(`/v1/scheduled-jobs/${jobId}/callback-api-key`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`getCallbackApiKey(${jobId}) failed: ${res.status()} — ${body}`);
    }
    const body = await res.json();
    const key: string | undefined = body.apiKey ?? body.data?.apiKey;
    if (!key) {
      throw new Error(`getCallbackApiKey: no apiKey in response — ${JSON.stringify(body)}`);
    }
    return key;
  } finally {
    await ctx.dispose();
  }
}
