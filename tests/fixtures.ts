/**
 * Re-export test fixtures from a stable path.
 * Import from this file in all test specs to avoid deep relative paths:
 *   import { test, expect } from '../fixtures';   // from tests/e2e/xxx/
 *   import { test, expect } from '../../fixtures'; // from tests/e2e/xxx/yyy/
 *
 * This is always 1 level up from any test subdirectory under tests/.
 */
export { test, expect } from '../src/fixtures/test-fixtures';
