/**
 * Mock External Process Server for AI Task Scheduler E2E testing.
 *
 * Implements the contract from:
 *   [Doc] Project Team Guide | Scheduled Job
 *   https://ekoapp.atlassian.net/wiki/spaces/EP/pages/3528917005
 *
 * Endpoints:
 *   POST /status-check  — Health check (EkoAI calls before each run)
 *   POST /webhook        — Receive per-user processing request, ack immediately
 *   GET  /logs           — Retrieve all received webhook calls (for test assertions)
 *   DELETE /logs         — Clear logs between test runs
 *   GET  /health         — Internal health check for test orchestration
 */

import * as http from 'http';

// ── Types ──────────────────────────────────────────────────────────

export interface WebhookLog {
  timestamp: string;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

export interface MockServerConfig {
  port?: number;
  expectedApiKey?: string;
  /** EkoAI callback URL — if set, server will POST result back after receiving webhook */
  callbackUrl?: string;
  /** Callback API key (x-api-key header for callback) */
  callbackApiKey?: string;
  /** Delay in ms before sending callback (simulates processing time). Default: 1000 */
  callbackDelayMs?: number;
}

/**
 * Runtime behavior overrides — set via POST /config to simulate failures.
 * Reset via DELETE /config.
 */
export interface BehaviorOverrides {
  /** /status-check returns this HTTP status instead of 200 */
  statusCheckCode?: number;
  /** /webhook returns this HTTP status instead of 200 */
  webhookCode?: number;
  /** /webhook delays ack response by this many ms (simulates slow ack > 10s) */
  webhookAckDelayMs?: number;
  /** Skip sending callback entirely (simulates process server that never responds) */
  skipCallback?: boolean;
  /** Send callback with status: "fail" instead of "success" */
  callbackFail?: boolean;
  /** Send callback with invalid/missing ID */
  callbackInvalidId?: boolean;
  /** Send callback with invalid API key */
  callbackWrongApiKey?: boolean;
  /** Delay callback by this many ms (overrides callbackDelayMs) */
  callbackDelayOverrideMs?: number;
}

// ── State ──────────────────────────────────────────────────────────

let logs: WebhookLog[] = [];
let behaviorOverrides: BehaviorOverrides = {};

// ── Helpers ────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(data || null);
      }
    });
  });
}

function json(res: http.ServerResponse, status: number, body: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function sendCallback(
  callbackUrl: string,
  callbackApiKey: string,
  id: string,
  delayMs: number,
  resultStatus: 'success' | 'fail' = 'success',
) {
  return new Promise<void>((resolve) => {
    setTimeout(async () => {
      try {
        // Callback payload format: { id, homePage: { widgets, lang } }
        // NOTE: EkoAI API does NOT accept "status" or "result" wrapper fields.
        //       homePage must be at root level of the body.
        const payload = JSON.stringify(resultStatus === 'fail' ? {
          id,
        } : {
          id,
          homePage: {
            widgets: [
              {
                type: 'text-box',
                mode: 'default',
                structure: {
                  title: 'QA Mock Server Response',
                  content: `Test callback for run user ${id} at ${new Date().toISOString()}`,
                },
              },
            ],
            lang: 'en',
          },
        });

        const url = new URL(callbackUrl);
        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': callbackApiKey,
            'Content-Length': Buffer.byteLength(payload),
          },
        };

        // Use https if needed
        const lib = url.protocol === 'https:' ? require('https') : http;
        const cbReq = lib.request(options, (cbRes: http.IncomingMessage) => {
          let cbData = '';
          cbRes.on('data', (c: string) => (cbData += c));
          cbRes.on('end', () => {
            logs.push({
              timestamp: new Date().toISOString(),
              method: 'CALLBACK_SENT',
              path: callbackUrl,
              headers: { 'x-api-key': callbackApiKey },
              body: { id, responseStatus: cbRes.statusCode, responseBody: cbData },
            });
            resolve();
          });
        });
        cbReq.on('error', (err: Error) => {
          logs.push({
            timestamp: new Date().toISOString(),
            method: 'CALLBACK_ERROR',
            path: callbackUrl,
            headers: {},
            body: { id, error: err.message },
          });
          resolve();
        });
        cbReq.write(payload);
        cbReq.end();
      } catch (err: any) {
        logs.push({
          timestamp: new Date().toISOString(),
          method: 'CALLBACK_ERROR',
          path: callbackUrl,
          headers: {},
          body: { id, error: err.message },
        });
        resolve();
      }
    }, delayMs);
  });
}

// ── Server Factory ─────────────────────────────────────────────────

export function createMockProcessServer(config: MockServerConfig = {}) {
  const {
    expectedApiKey,
    callbackUrl,
    callbackApiKey,
    callbackDelayMs = 1000,
  } = config;

  const server = http.createServer(async (req, res) => {
    const body = await parseBody(req);
    const path = req.url?.split('?')[0] || '/';
    const method = req.method || 'GET';

    // ── POST /config (test control) ──────────────────────────
    if (method === 'POST' && path === '/config') {
      behaviorOverrides = { ...behaviorOverrides, ...body };
      return json(res, 200, { overrides: behaviorOverrides });
    }

    // ── DELETE /config (reset behavior) ────────────────────────
    if (method === 'DELETE' && path === '/config') {
      behaviorOverrides = {};
      return json(res, 200, { overrides: behaviorOverrides });
    }

    // ── GET /config ────────────────────────────────────────────
    if (method === 'GET' && path === '/config') {
      return json(res, 200, { overrides: behaviorOverrides });
    }

    // ── POST /status-check ─────────────────────────────────────
    if (method === 'POST' && path === '/status-check') {
      if (expectedApiKey) {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== expectedApiKey) {
          return json(res, 401, { error: 'Invalid API key' });
        }
      }
      logs.push({
        timestamp: new Date().toISOString(),
        method,
        path,
        headers: { 'x-api-key': req.headers['x-api-key'] as string },
        body,
      });
      // Simulate failure if configured
      if (behaviorOverrides.statusCheckCode) {
        return json(res, behaviorOverrides.statusCheckCode, { error: 'Simulated status-check failure' });
      }
      return json(res, 200, { status: 'ok' });
    }

    // ── POST /webhook ──────────────────────────────────────────
    if (method === 'POST' && path === '/webhook') {
      if (expectedApiKey) {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== expectedApiKey) {
          return json(res, 401, { error: 'Invalid API key' });
        }
      }

      logs.push({
        timestamp: new Date().toISOString(),
        method,
        path,
        headers: {
          'x-api-key': req.headers['x-api-key'] as string,
          'content-type': req.headers['content-type'] as string,
        },
        body,
      });

      // Simulate webhook failure if configured
      if (behaviorOverrides.webhookCode) {
        const delay = behaviorOverrides.webhookAckDelayMs || 0;
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        return json(res, behaviorOverrides.webhookCode, { error: 'Simulated webhook failure' });
      }

      // Simulate slow ack (to test 10s ack timeout)
      if (behaviorOverrides.webhookAckDelayMs) {
        await new Promise((r) => setTimeout(r, behaviorOverrides.webhookAckDelayMs));
      }

      // Ack immediately (as per spec)
      json(res, 200, { accepted: true });

      // Skip callback if configured
      if (behaviorOverrides.skipCallback) return;

      // Determine callback config
      const cbDelay = behaviorOverrides.callbackDelayOverrideMs ?? callbackDelayMs;
      const cbApiKey = behaviorOverrides.callbackWrongApiKey
        ? 'invalid-wrong-key'
        : callbackApiKey;
      const cbId = behaviorOverrides.callbackInvalidId
        ? 'non-existent-id-xxx'
        : body?.id;
      const cbStatus = behaviorOverrides.callbackFail ? 'fail' : 'success';

      // Fire async callback if configured
      if (callbackUrl && cbApiKey && cbId) {
        sendCallback(callbackUrl, cbApiKey, cbId, cbDelay, cbStatus);
      }
      return;
    }

    // ── GET /logs ──────────────────────────────────────────────
    if (method === 'GET' && path === '/logs') {
      return json(res, 200, { logs, count: logs.length });
    }

    // ── DELETE /logs ────────────────────────────────────────────
    if (method === 'DELETE' && path === '/logs') {
      logs = [];
      return json(res, 200, { cleared: true });
    }

    // ── GET /health ────────────────────────────────────────────
    if (method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok', logsCount: logs.length });
    }

    // ── 404 ────────────────────────────────────────────────────
    json(res, 404, { error: 'Not found' });
  });

  return server;
}

// ── Standalone mode ────────────────────────────────────────────────

if (require.main === module) {
  const port = parseInt(process.env.MOCK_SERVER_PORT || '3333', 10);
  const server = createMockProcessServer({
    port,
    expectedApiKey: process.env.MOCK_API_KEY || undefined,
    callbackUrl: process.env.CALLBACK_URL || undefined,
    callbackApiKey: process.env.CALLBACK_API_KEY || undefined,
    callbackDelayMs: parseInt(process.env.CALLBACK_DELAY_MS || '1000', 10),
  });

  server.listen(port, () => {
    console.log(`[mock-server] Process server listening on http://localhost:${port}`);
    console.log(`[mock-server] Endpoints:`);
    console.log(`  POST /status-check  — Health check`);
    console.log(`  POST /webhook       — Receive webhook`);
    console.log(`  GET  /logs          — View received logs`);
    console.log(`  DELETE /logs        — Clear logs`);
    console.log(`  GET  /health        — Server health`);
    if (process.env.CALLBACK_URL) {
      console.log(`[mock-server] Callback → ${process.env.CALLBACK_URL}`);
    }
  });
}
