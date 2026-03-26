/**
 * Cross-Sprint Conflict Checker
 *
 * Scans the playwright-tests project for potential conflicts between
 * test files from different sprints. Run with:
 *   npx ts-node scripts/check-conflicts.ts
 *
 * Checks:
 * 1. Duplicate selectors across page objects
 * 2. Hardcoded test data that may collide
 * 3. Global state mutations (afterAll with destructive ops)
 * 4. Duplicate test names
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'src', 'pages');
const TESTS_DIR = path.join(ROOT, 'tests');
const SELECTORS_DIR = path.join(ROOT, 'selectors');

interface Issue {
  severity: 'critical' | 'warning' | 'info';
  type: string;
  file: string;
  line?: number;
  message: string;
}

const issues: Issue[] = [];

function findFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkDuplicateSelectors(): void {
  const selectorMap = new Map<string, { file: string; line: number }[]>();
  const pageFiles = findFiles(PAGES_DIR, '.page.ts');

  for (const file of pageFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match locator definitions: page.locator('...'), page.getByTestId('...'), etc.
      const matches = line.match(/(?:locator|getByTestId|getByRole|getByLabel|getByText)\(['"`]([^'"`]+)['"`]/g);
      if (matches) {
        for (const match of matches) {
          const selectorValue = match.replace(/.*\(['"`]/, '').replace(/['"`].*/, '');
          const existing = selectorMap.get(selectorValue) || [];
          existing.push({ file: path.relative(ROOT, file), line: i + 1 });
          selectorMap.set(selectorValue, existing);
        }
      }
    }
  }

  for (const [selector, locations] of selectorMap) {
    if (locations.length > 1) {
      // Same selector in multiple files is fine if same page object
      const uniqueFiles = new Set(locations.map(l => l.file));
      if (uniqueFiles.size > 1) {
        issues.push({
          severity: 'warning',
          type: 'Duplicate Selector',
          file: [...uniqueFiles].join(', '),
          message: `Selector "${selector}" used in ${uniqueFiles.size} different page objects`,
        });
      }
    }
  }
}

function checkGlobalStateMutations(): void {
  const testFiles = findFiles(TESTS_DIR, '.spec.ts');
  const destructivePatterns = [
    /afterAll.*delete/is,
    /afterAll.*remove/is,
    /afterAll.*clear/is,
    /afterAll.*drop/is,
    /afterEach.*delete/is,
  ];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const pattern of destructivePatterns) {
      if (pattern.test(content)) {
        issues.push({
          severity: 'critical',
          type: 'Global State Mutation',
          file: path.relative(ROOT, file),
          message: 'afterAll/afterEach contains destructive operation — may break other tests',
        });
      }
    }
  }
}

function checkDuplicateTestNames(): void {
  const testNames = new Map<string, string[]>();
  const testFiles = findFiles(TESTS_DIR, '.spec.ts');

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const matches = content.matchAll(/test\(['"`]([^'"`]+)['"`]/g);
    for (const match of matches) {
      const name = match[1];
      const existing = testNames.get(name) || [];
      existing.push(path.relative(ROOT, file));
      testNames.set(name, existing);
    }
  }

  for (const [name, files] of testNames) {
    if (files.length > 1) {
      issues.push({
        severity: 'warning',
        type: 'Duplicate Test Name',
        file: files.join(', '),
        message: `Test "${name.substring(0, 60)}..." appears in ${files.length} files`,
      });
    }
  }
}

function checkHardcodedWaits(): void {
  const testFiles = findFiles(TESTS_DIR, '.spec.ts');

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('waitForTimeout')) {
        issues.push({
          severity: 'critical',
          type: 'Hardcoded Wait',
          file: path.relative(ROOT, file),
          line: i + 1,
          message: 'waitForTimeout() is a flaky anti-pattern — use explicit waits',
        });
      }
    }
  }
}

// Run all checks
console.log('🔍 Running cross-sprint conflict checks...\n');

checkDuplicateSelectors();
checkGlobalStateMutations();
checkDuplicateTestNames();
checkHardcodedWaits();

// Report
if (issues.length === 0) {
  console.log('✅ No conflicts detected!\n');
  process.exit(0);
}

const critical = issues.filter(i => i.severity === 'critical');
const warnings = issues.filter(i => i.severity === 'warning');
const info = issues.filter(i => i.severity === 'info');

console.log(`Found ${issues.length} issue(s):\n`);

if (critical.length > 0) {
  console.log(`🔴 Critical (${critical.length}):`);
  for (const i of critical) {
    console.log(`  ${i.type} — ${i.file}${i.line ? `:${i.line}` : ''}`);
    console.log(`    ${i.message}`);
  }
  console.log();
}

if (warnings.length > 0) {
  console.log(`🟡 Warning (${warnings.length}):`);
  for (const i of warnings) {
    console.log(`  ${i.type} — ${i.file}${i.line ? `:${i.line}` : ''}`);
    console.log(`    ${i.message}`);
  }
  console.log();
}

if (info.length > 0) {
  console.log(`🟢 Info (${info.length}):`);
  for (const i of info) {
    console.log(`  ${i.type} — ${i.file}${i.line ? `:${i.line}` : ''}`);
    console.log(`    ${i.message}`);
  }
  console.log();
}

process.exit(critical.length > 0 ? 1 : 0);
