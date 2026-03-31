# EkoAI Playwright Test Automation

> **Repository:** `ApiwatKansaard/Claude_QA_Automation`
> **Sibling repo:** `ApiwatKansaard/Claude_QA_Agent` (agents, skills, sprint data)
> **Last updated:** 2026-03-30 · **143 automated test cases** · Morning Brief 18.0

Automated E2E and API tests for the EkoAI platform using Playwright + TypeScript.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install --with-deps chromium

# 3. Copy env and fill credentials
cp .env.example .env
# Edit environments/.env.staging with your ADMIN_EMAIL + ADMIN_PASSWORD

# 4. Run all tests
npm test

# 5. Run Morning Brief tests only
npx playwright test tests/e2e/agentic/morning-brief/
npx playwright test tests/api/agentic/morning-brief/

# 6. Generate reports (ALWAYS run both after test)
python3 scripts/generate_report.py       # Team numbers report
python3 scripts/generate_risk_report.py  # Risk story report for meetings
```

## Test Coverage — Morning Brief 18.0

| Spec File | Tests | Section | Type |
|---|---|---|---|
| `dashboard.spec.ts` | 9 | Dashboard (UI) | E2E |
| `create-job.spec.ts` | 13 | Create Scheduled Job (UI) | E2E |
| `custom-recurrence.spec.ts` | 24 | Custom Recurrence Modal | E2E |
| `job-config.spec.ts` | 11 | Job Configuration (UI) | E2E |
| `recipients.spec.ts` | 11 | Recipients / Audience (UI) | E2E |
| `history-logs.spec.ts` | 10 | History Logs (UI) | E2E |
| `widget-rendering.spec.ts` | 12 | Widget Rendering (UI/API) | E2E+API |
| `trigger-step.api.spec.ts` | 10 | Trigger Step | API |
| `process-step.api.spec.ts` | 12 | Process Step | API |
| `action-step.api.spec.ts` | 11 | Action Step | API |
| `callback.api.spec.ts` | 10 | Callback | API |
| `security.api.spec.ts` | 10 | Security | API |
| **Total** | **143** | | |

## Reports

After every test run, **2 HTML reports** are generated:

| Report | Script | Purpose |
|---|---|---|
| **Team Report** | `scripts/generate_report.py` | Numbers + module breakdown (share via Slack/email) |
| **Risk Story Report** | `scripts/generate_risk_report.py` | Risk stories for PM meetings (Amity branded, dark glassmorphism) |

```bash
# Generate both
python3 scripts/generate_report.py reports/staging/results.json reports/staging/team-report.html "Morning Brief 18.0" staging
python3 scripts/generate_risk_report.py reports/staging/results.json reports/staging/risk-story-report.html "Morning Brief 18.0" staging

# Open in browser
open reports/staging/team-report.html
open reports/staging/risk-story-report.html
```

## Multi-Environment Support

| File | Environment | Login |
|---|---|---|
| `environments/.env.dev` | Development | cognito / basic |
| `environments/.env.staging` | Staging | cognito |
| `environments/.env.prod` | Production | cognito / sso (READONLY) |

```bash
npm run test:staging          # All tests on staging
npm run test:staging:smoke    # Smoke only
npm run test:staging:regression  # Regression only
```

## Project Structure

```
QA_Automation/
├── playwright.config.ts          # Config (multi-env, projects, reporters)
├── environments/                 # Per-environment .env files
│   ├── .env.dev
│   ├── .env.staging
│   └── .env.prod
├── src/
│   ├── config/
│   │   └── env.config.ts         # Centralized env loader & validation
│   ├── pages/                    # Page Object Model (POM)
│   │   ├── base.page.ts
│   │   ├── login.page.ts
│   │   └── agentic/              # Morning Brief page objects
│   │       ├── scheduler.page.ts
│   │       └── scheduled-jobs/
│   │           ├── create-wizard.page.ts
│   │           ├── job-config.page.ts
│   │           ├── recipients.page.ts
│   │           └── history-logs.page.ts
│   ├── fixtures/
│   │   └── test-fixtures.ts      # Extended test with POM injection
│   ├── helpers/
│   │   ├── api.helper.ts         # API request wrapper
│   │   ├── auth.helper.ts        # Per-env auth state
│   │   ├── data.helper.ts        # Test data & CSV parsing
│   │   ├── env-guard.helper.ts   # Production safety guard
│   │   ├── job-factory.ts        # Create/delete scheduled jobs via API
│   │   └── cleanup.helper.ts     # Auto-cleanup after tests
│   └── types/
│       └── index.ts
├── tests/
│   ├── auth.setup.ts             # Authentication setup
│   ├── fixtures.ts               # Re-export (stable import path)
│   ├── e2e/agentic/morning-brief/  # ★ E2E UI tests (90 cases)
│   │   ├── dashboard.spec.ts          # 9 tests
│   │   ├── create-job.spec.ts         # 13 tests
│   │   ├── custom-recurrence.spec.ts  # 24 tests (★ most comprehensive)
│   │   ├── job-config.spec.ts         # 11 tests
│   │   ├── recipients.spec.ts         # 11 tests
│   │   ├── history-logs.spec.ts       # 10 tests
│   │   └── widget-rendering.spec.ts   # 12 tests
│   └── api/agentic/morning-brief/  # API tests
│       ├── trigger-step.api.spec.ts
│       ├── process-step.api.spec.ts
│       ├── action-step.api.spec.ts
│       ├── callback.api.spec.ts
│       └── security.api.spec.ts
├── scripts/
│   ├── generate_report.py        # Team HTML report generator
│   ├── generate_risk_report.py   # Risk Story report (Amity branded)
│   └── push_testrail.py          # Push results to TestRail
├── reports/                      # Generated reports (gitignored)
│   └── staging/
│       ├── results.json
│       ├── team-report.html
│       ├── risk-story-report.html
│       └── html/                 # Playwright default HTML report
└── test-results/                 # Screenshots on failure (gitignored)
```

## Test Tagging Convention

| Tag | Meaning | Command |
|---|---|---|
| `@smoke` | Critical path | `npx playwright test --grep @smoke` |
| `@sanity` | Quick verification | `npx playwright test --grep @sanity` |
| `@regression` | Full regression | `npx playwright test --grep @regression` |
| `@P1` / `@P2` | Priority | `npx playwright test --grep @P1` |
| `@morning-brief` | Morning Brief feature | `npx playwright test --grep @morning-brief` |
| `@custom-recurrence` | Custom recurrence modal | `npx playwright test --grep @custom-recurrence` |
| `@api` | API-only tests | `npx playwright test --grep @api` |

## Key Patterns

### Cleanup Rule (MANDATORY)

Every test that creates data MUST clean up:

```typescript
let jobId: string;
test.beforeAll(async () => { jobId = await createJob('SuiteName'); });
test.afterAll(async () => { if (jobId) await deleteJob(jobId); });
```

### Ant Design Selectors (Pitfalls A1–A13)

See `QA_Agent/.github/skills/playwright-automator/SKILL.md` for 13 documented pitfalls including:
- **A8:** Ant Design Select — use React fiber `onChange()`, not `.click()`
- **A9:** Day button state — CSS class `bg-primary`, not `aria-pressed`
- **A10:** Modal buttons inside `.ant-modal-content`, no `.ant-modal-footer`
- **A11:** ALWAYS inspect platform DOM before writing selectors

### TestRail Integration

Every test has a TestRail annotation:
```typescript
test('should do something', {
  annotation: { type: 'TestRail', description: 'C1552304' },
  tag: ['@smoke', '@P1'],
}, async ({ page }) => { ... });
```

## Integration with QA Agent

| Agent | Purpose |
|---|---|
| `qa-ops-director` | Test plans, AC writing, bug reports, TestRail |
| `playwright-automator` | Generate/run/review Playwright tests |
| `automation-reviewer` | Review test quality, detect conflicts |
| `qa-html-report` | Generate team + risk story HTML reports |
