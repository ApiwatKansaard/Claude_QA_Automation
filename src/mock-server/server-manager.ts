/**
 * Manages mock process server + ngrok tunnel lifecycle for Playwright tests.
 *
 * Usage in test:
 *   const manager = new MockServerManager({ expectedApiKey: 'my-key' });
 *   await manager.start();   // starts server + ngrok
 *   console.log(manager.publicUrl); // https://xxxx.ngrok-free.app
 *   // ... run tests ...
 *   await manager.stop();    // cleanup
 */

import * as http from 'http';
import { createMockProcessServer, MockServerConfig, WebhookLog } from './process-server';
import { spawn, ChildProcess } from 'child_process';

export class MockServerManager {
  private server: http.Server | null = null;
  private ngrokProcess: ChildProcess | null = null;
  private _publicUrl: string = '';
  private _port: number;
  private config: MockServerConfig;

  constructor(config: MockServerConfig & { port?: number } = {}) {
    this._port = config.port || 3333;
    this.config = config;
  }

  get publicUrl(): string {
    return this._publicUrl;
  }

  get port(): number {
    return this._port;
  }

  get localUrl(): string {
    return `http://localhost:${this._port}`;
  }

  /** Start mock server + ngrok tunnel */
  async start(): Promise<string> {
    // 1. Kill any existing process on the port
    try {
      const { execSync } = require('child_process');
      execSync(`lsof -ti:${this._port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
      await new Promise((r) => setTimeout(r, 500));
    } catch { /* no process on port — ok */ }

    // 2. Start mock server
    this.server = createMockProcessServer(this.config);
    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this._port} is still in use`));
        } else {
          reject(err);
        }
      });
      this.server!.listen(this._port, () => {
        console.log(`[mock-server] listening on port ${this._port}`);
        resolve();
      });
    });

    // 2. Start ngrok tunnel
    this._publicUrl = await this.startNgrok();
    console.log(`[mock-server] ngrok tunnel: ${this._publicUrl}`);

    return this._publicUrl;
  }

  /** Stop mock server + ngrok tunnel */
  async stop(): Promise<void> {
    if (this.ngrokProcess) {
      this.ngrokProcess.kill('SIGTERM');
      this.ngrokProcess = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
    console.log('[mock-server] stopped');
  }

  /** Get all webhook logs from mock server */
  async getLogs(): Promise<WebhookLog[]> {
    const res = await fetch(`${this.localUrl}/logs`);
    const data = await res.json();
    return data.logs || [];
  }

  /** Get only webhook call logs (exclude status-check, callbacks) */
  async getWebhookLogs(): Promise<WebhookLog[]> {
    const all = await this.getLogs();
    return all.filter((l) => l.method === 'POST' && l.path === '/webhook');
  }

  /** Get callback logs */
  async getCallbackLogs(): Promise<WebhookLog[]> {
    const all = await this.getLogs();
    return all.filter((l) => l.method === 'CALLBACK_SENT' || l.method === 'CALLBACK_ERROR');
  }

  /** Clear all logs */
  async clearLogs(): Promise<void> {
    await fetch(`${this.localUrl}/logs`, { method: 'DELETE' });
  }

  /** Set behavior overrides at runtime (for failure simulation) */
  async setBehavior(overrides: Record<string, any>): Promise<void> {
    await fetch(`${this.localUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides),
    });
  }

  /** Reset all behavior overrides to defaults */
  async resetBehavior(): Promise<void> {
    await fetch(`${this.localUrl}/config`, { method: 'DELETE' });
  }

  /** Update callback config at runtime (useful after getting callback API key from UI) */
  updateCallbackConfig(callbackUrl: string, callbackApiKey: string) {
    this.config.callbackUrl = callbackUrl;
    this.config.callbackApiKey = callbackApiKey;
    // Restart server with new config
    // For simplicity, we set env vars that the server reads
    // In practice the server instance already has the closure config
    console.log(`[mock-server] callback config updated: ${callbackUrl}`);
  }

  // ── Private ─────────────────────────────────────────────────────

  private async startNgrok(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ngrok tunnel failed to start within 15s'));
      }, 15_000);

      this.ngrokProcess = spawn('ngrok', ['http', String(this._port), '--log=stdout'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      this.ngrokProcess.stdout?.on('data', (chunk) => {
        output += chunk.toString();
        // Parse ngrok output for the public URL
        const match = output.match(/url=(https:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });

      this.ngrokProcess.stderr?.on('data', (chunk) => {
        output += chunk.toString();
      });

      this.ngrokProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`ngrok failed to start: ${err.message}`));
      });

      this.ngrokProcess.on('exit', (code) => {
        if (!this._publicUrl) {
          clearTimeout(timeout);
          // Fallback: try ngrok API
          this.getNgrokUrlFromApi().then(resolve).catch(reject);
        }
      });

      // Fallback: poll ngrok API after 3s
      setTimeout(() => {
        if (!this._publicUrl) {
          this.getNgrokUrlFromApi()
            .then((url) => {
              clearTimeout(timeout);
              resolve(url);
            })
            .catch(() => {
              // keep waiting for stdout
            });
        }
      }, 3000);
    });
  }

  private async getNgrokUrlFromApi(): Promise<string> {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = await res.json();
    const tunnel = data.tunnels?.find((t: any) => t.proto === 'https');
    if (tunnel?.public_url) return tunnel.public_url;
    throw new Error('No ngrok tunnel found via API');
  }
}
