import { APIRequestContext, expect } from '@playwright/test';

/**
 * API helper — wraps Playwright's APIRequestContext for cleaner API tests.
 * Handles common patterns: JSON responses, auth headers, error checking.
 */
export class ApiHelper {
  private request: APIRequestContext;
  private baseURL: string;

  constructor(request: APIRequestContext, baseURL?: string) {
    this.request = request;
    this.baseURL = baseURL || process.env.API_BASE_URL || '';
  }

  async get<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, this.baseURL);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const response = await this.request.get(url.toString());
    expect(response.ok(), `GET ${endpoint} failed: ${response.status()}`).toBeTruthy();
    return response.json() as Promise<T>;
  }

  async post<T = unknown>(endpoint: string, data: unknown): Promise<T> {
    const url = new URL(endpoint, this.baseURL);
    const response = await this.request.post(url.toString(), { data });
    return response.json() as Promise<T>;
  }

  async put<T = unknown>(endpoint: string, data: unknown): Promise<T> {
    const url = new URL(endpoint, this.baseURL);
    const response = await this.request.put(url.toString(), { data });
    return response.json() as Promise<T>;
  }

  async delete(endpoint: string): Promise<void> {
    const url = new URL(endpoint, this.baseURL);
    const response = await this.request.delete(url.toString());
    expect(response.ok(), `DELETE ${endpoint} failed: ${response.status()}`).toBeTruthy();
  }

  /** Get raw response for custom status assertions */
  async getRaw(endpoint: string) {
    const url = new URL(endpoint, this.baseURL);
    return this.request.get(url.toString());
  }

  async postRaw(endpoint: string, data: unknown) {
    const url = new URL(endpoint, this.baseURL);
    return this.request.post(url.toString(), { data });
  }
}
