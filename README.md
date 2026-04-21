# EkoAI Playwright Test Automation

> **Repository:** `ApiwatKansaard/Claude_QA_Automation`
> **Sibling repo:** `ApiwatKansaard/Claude_QA_Agent` (agents, skills, sprint data)
> **Last updated:** 2026-04-21 · **196 automated test cases** · AI Task Scheduler + Scheduled Jobs
> **Platform:** Claude Code (CLI + VSCode Extension)

Automated E2E and API tests for the EkoAI platform using Playwright + TypeScript.

## Recent changes

**2026-04-21 — Widget Webhook Server + one-shot Scheduled Job factory**

Stand up a full Scheduled Job demo (widget-composed HTML → live on the Eko
homepage) with two commands:

```bash
# 1. Start the webhook server (port 6767)
cd src/widget-webhook-server && npm install && npm start

# 2. Create a scheduled job via API (job + callback key + preset wiring)
node scripts/create-scheduler.mjs \
  --copy-audience-from <existingJobId> \
  scripts/configs/demo-sales-dashboard.json
```

- New: `src/widget-webhook-server/` — multi-preset Express server with
  15 reusable widgets (Text, LineChart, Tabs, Carousel, etc.). Each preset
  (JSON composition or raw HTML) gets its own webhook path and callback key.
  Preview any preset at `http://localhost:6767/<preset>/preview`.
- New: `scripts/create-scheduler.mjs` — one-shot job factory: POSTs
  `/v1/scheduled-jobs`, generates the `scbk_` callback API key via
  `POST /v1/scheduled-jobs/{id}/callback-api-key`, and writes the key into
  the matching preset file so the webhook server picks it up automatically.
- Details in [src/widget-webhook-server/README.md](src/widget-webhook-server/README.md).

**2026-04-21 — Callback API contract migration (AE-14621 retest)**
- Migrated all callback tests + mock server to the production contract per [Doc] Project Team Guide | Scheduled Job (Confluence 3528917005) and Tech Spec AE-14600.
- **Path:** `/v1/scheduled-jobs/runs/callback` (was `/v1/scheduled-jobs/callback`)
- **Header:** `x-api-key: scbk_<key>` (was `x-scheduled-job-api-key: qa-test-key`)
- **Body:** `{id, homePage?:{html, lang}}` (flat — removed legacy `status`/`result`/`quotaConsumed`/`blocks`/`widgets` wrappers)
- New helper: `src/helpers/callback-key.helper.ts` — `getCallbackApiKey(jobId)` hits `POST /v1/scheduled-jobs/{jobId}/callback-api-key`
- Files updated: `callback.api.spec.ts` (morning-brief + scheduled-jobs), `action-step.api.spec.ts`, `security.api.spec.ts` (both suites), `process-step.api.spec.ts`, `src/mock-server/process-server.ts`
- AE-14621 fix verified: >1MB payload → 413 `PayloadTooLargeException` (was 500). 59 passed, 4 skipped, 0 failed.

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

# 5. Run AI Task Scheduler tests
npm run test:ai-scheduler          # All scheduler tests (UI + API + webhook)
npm run test:webhook               # Webhook E2E tests only
npm run test:webhook:smoke         # Webhook smoke only
npm run test:webhook:scenarios     # Failure scenario tests
npm run test:history-log           # History log with mock server

# 6. Run mock process server (for manual webhook testing)
npm run mock-server

# 7. Generate reports (ALWAYS run after test)
python3 scripts/generate_report.py
```

## Test Coverage

### AI Task Scheduler / Scheduled Jobs

| Spec File | Tests | Section | Type |
|---|---|---|---|
| `scheduler-list.spec.ts` | 9 | Dashboard / List (UI) | E2E |
| `create-job.spec.ts` | 12 | Create Scheduled Job (UI) | E2E |
| `job-config.spec.ts` | 12 | Job Configuration (UI) | E2E |
| `recipients.spec.ts` | 13 | Recipients / Audience (UI) | E2E |
| `history-logs.spec.ts` | 12 | History Logs (UI) | E2E |
| `webhook-e2e.spec.ts` | 8 | Webhook E2E + Mock Server | E2E |
| `webhook-scenarios.spec.ts` | 20 | Failure / Timeout / Retry | E2E |
| `history-logs-with-mock.spec.ts` | 14 | History Logs with Real Data | E2E |
| `trigger-step.api.spec.ts` | 9 | Trigger Step | API |
| `process-step.api.spec.ts` | 14 | Process Step | API |
| `action-step.api.spec.ts` | 10 | Action Step | API |
| `callback.api.spec.ts` | 10 | Callback | API |
| `security.api.spec.ts` | 9 | Security | API |
| `cutoff-timeout.api.spec.ts` | 7 | Cutoff Timeout | API |
| `status-check.api.spec.ts` | 7 | Status Check | API |
| `home-page-delivery.api.spec.ts` | 13 | Home Page Delivery | API |
| `widget-rendering.api.spec.ts` | 9 | Widget Rendering | API |
| `scheduled-jobs-crud.api.spec.ts` | 2 | CRUD | API |
| `scheduled-jobs.api.spec.ts` | 7 | General API | API |
| **Total** | **196** | | |

### Latest Results (2026-04-02)

| Environment | Passed | Failed | Skipped | Pass Rate |
|---|---|---|---|---|
| Staging (Full) | 146 | 0 | 50 | 100% |
| Prod (Smoke) | 50 | 0 | 17 | 100% |

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
│   ├── mock-server/              # ★ Mock Process Server for webhook testing
│   │   ├── process-server.ts     # Express server (status-check, webhook, callback)
│   │   ├── server-manager.ts     # Lifecycle: start/stop server + ngrok tunnel
│   │   └── index.ts              # Barrel exports
│   ├── pages/                    # Page Object Model (POM)
│   │   ├── base.page.ts
│   │   ├── login.page.ts
│   │   └── agentic/
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
│   │   ├── auth.helper.ts        # Per-env auth (Bearer + Basic for /_internal/)
│   │   ├── data.helper.ts        # Test data & CSV parsing
│   │   ├── env-guard.helper.ts   # Production safety guard
│   │   ├── job-factory.ts        # Create/delete scheduled jobs via API
│   │   └── cleanup.helper.ts     # Auto-cleanup after tests
│   └── types/
│       └── index.ts
├── tests/
│   ├── auth.setup.ts             # Authentication setup
│   ├── fixtures.ts               # Re-export (stable import path)
│   ├── e2e/agentic/scheduled-jobs/    # ★ Scheduled Jobs UI tests
│   │   ├── scheduler-list.spec.ts     # 9 tests
│   │   ├── create-job.spec.ts         # 12 tests
│   │   ├── job-config.spec.ts         # 12 tests
│   │   ├── recipients.spec.ts         # 13 tests
│   │   └── history-logs.spec.ts       # 12 tests
│   ├── e2e/ekoai-console/ai-task-scheduler/  # ★ Webhook E2E tests
│   │   ├── webhook-e2e.spec.ts              # 8 tests (mock server + ngrok)
│   │   ├── webhook-scenarios.spec.ts        # 20 tests (failure/timeout/retry)
│   │   └── history-logs-with-mock.spec.ts   # 14 tests (real run data)
│   └── api/agentic/scheduled-jobs/    # ★ API tests (16 specs)
│       ├── trigger-step.api.spec.ts
│       ├── process-step.api.spec.ts
│       ├── action-step.api.spec.ts
│       ├── callback.api.spec.ts
│       ├── security.api.spec.ts
│       ├── cutoff-timeout.api.spec.ts
│       ├── status-check.api.spec.ts
│       ├── home-page-delivery.api.spec.ts
│       ├── widget-rendering.api.spec.ts
│       ├── scheduled-jobs-crud.api.spec.ts
│       └── scheduled-jobs.api.spec.ts
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
| `@scheduled-jobs` | Scheduled Jobs feature | `npx playwright test --grep @scheduled-jobs` |
| `@ai-task-scheduler` | AI Task Scheduler (webhook) | `npx playwright test --grep @ai-task-scheduler` |
| `@webhook` | Webhook tests | `npx playwright test --grep @webhook` |
| `@history-log` | History log tests | `npx playwright test --grep @history-log` |
| `@api` | API-only tests | `npx playwright test --grep @api` |
| `@slow` | Long-running (wait for trigger) | Excluded by default |

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
