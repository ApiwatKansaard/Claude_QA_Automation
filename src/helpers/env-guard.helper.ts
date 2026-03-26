import { loadEnvConfig } from '../config/env.config';

/**
 * Tags that indicate destructive operations.
 * Tests with these tags will be SKIPPED in readonly mode (production).
 */
const DESTRUCTIVE_TAGS = ['@destructive', '@create', '@update', '@delete', '@write'];

/**
 * Call in test.beforeEach or at describe level to skip destructive tests on prod.
 * Usage: test.skip(shouldSkipDestructive(), 'Destructive tests disabled on production');
 */
export function shouldSkipDestructive(): boolean {
  const config = loadEnvConfig();
  return config.readonlyMode;
}

/**
 * Get current environment name for test annotations.
 */
export function getCurrentEnv(): string {
  return loadEnvConfig().env;
}

/**
 * Check if a set of tags includes any destructive tag.
 */
export function hasDestructiveTag(tags: string[]): boolean {
  return tags.some((t) => DESTRUCTIVE_TAGS.includes(t.toLowerCase()));
}
