/**
 * Shared TypeScript types for the EkoAI test automation framework.
 */

/** Environment configuration (from .env) */
export interface TestEnvConfig {
  baseURL: string;
  apiBaseURL: string;
  adminEmail: string;
  adminPassword: string;
  apiToken: string;
}

/** Scheduled Job entity (mirrors backend model) */
export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  status: 'enabled' | 'disabled';
  schedule: string; // cron expression
  lastRun?: string;
  nextRun?: string;
  endpoint: string;
  actionType: 'MORNING_BRIEF';
  audienceType: 'Eko';
}

/** API response wrapper */
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

/** Page element selector map — used by agents to map selectors */
export interface SelectorMap {
  [pageName: string]: {
    [elementName: string]: {
      selector: string;
      type: 'css' | 'xpath' | 'testid' | 'role' | 'text';
      description: string;
    };
  };
}

/** Test case mapping — links TestRail case to automation */
export interface TestCaseMapping {
  testRailId?: string;
  section: string;
  title: string;
  automationFile: string;
  automationTestName: string;
  status: 'automated' | 'pending' | 'not-automatable';
  tags: string[];
}
