import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

/**
 * Data helper — utilities for test data management, CSV parsing,
 * and generating structured test data from TestRail CSV files.
 */

/** Parse a TestRail CSV file and return test case records */
export function parseTestRailCSV(csvPath: string): TestRailCase[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records as TestRailCase[];
}

/** Filter test cases by section, priority, or test type */
export function filterCases(
  cases: TestRailCase[],
  filters: {
    section?: string;
    priority?: string;
    type?: string;
    automatable?: boolean;
  },
): TestRailCase[] {
  return cases.filter((tc) => {
    if (filters.section && !tc.Section.includes(filters.section)) return false;
    if (filters.priority && tc.P !== filters.priority) return false;
    if (filters.type && tc.Type !== filters.type) return false;
    if (filters.automatable && tc.TestMethod !== 'Manual') return false;
    return true;
  });
}

/** Generate a unique test ID from section + title */
export function generateTestId(section: string, title: string): string {
  const sectionSlug = section.split('>').pop()?.trim().toLowerCase().replace(/\s+/g, '-') || 'unknown';
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 60);
  return `${sectionSlug}--${titleSlug}`;
}

/** Read JSON test data file */
export function readTestData<T = unknown>(filename: string): T {
  const filePath = path.resolve(__dirname, '../../test-data', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/** Generate random string for unique test data */
export function randomString(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Generate a timestamp string for unique naming */
export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// --- Types ---

export interface TestRailCase {
  Section: string;
  Role: string;
  Channel: string;
  Title: string;
  'Test Data': string;
  Preconditions: string;
  Steps: string;
  'Expected Result': string;
  Platform: string;
  TestMethod: string;
  Type: string;
  P: string;
  References: string;
  'Release version': string;
  'QA Responsibility': string;
}
