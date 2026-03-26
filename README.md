# EkoAI Playwright Test Automation

> **Repository:** `convolabai/QA_Automation`  
> **Sibling repo:** `convolabai/QA_Agent` (agents, skills, sprint data)  
> **Workspace:** Use `qa-workspace.code-workspace` to open both repos in one VS Code window.

Automated E2E and API tests for the EkoAI platform using Playwright.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install --with-deps chromium

# 3. Copy env and fill credentials
cp .env.example .env
cp environments/.env.staging.example environments/.env.staging  # fill credentials

# 4. Run tests
npm test                    # All tests (uses TEST_ENV from .env)
npm run test:smoke          # Smoke tests only
npm run test:e2e            # E2E tests only
npm run test:api            # API tests only
npm run test:headed         # Watch tests in browser
npm run test:ui             # Playwright UI mode
```

## Multi-Environment Support

Tests can run against **dev**, **staging**, or **prod** environments.

### Configuration

Each environment has its own config file in `environments/`:

| File | Environment | Login Method |
|---|---|---|
| `environments/.env.dev` | Development | cognito / basic |
| `environments/.env.staging` | Staging | cognito |
| `environments/.env.prod` | Production | cognito / sso |

The `TEST_ENV` variable in `.env` controls which environment loads. The system:
1. Reads `TEST_ENV` → loads `environments/.env.{env}`
2. Validates required fields (BASE_URL, credentials)
3. Sets per-env auth state: `playwright/.auth/{env}-user.json`
4. Reports to per-env folder: `reports/{env}/html`

### Run Commands by Environment

```bash
# Environment-specific
npm run test:dev              # All tests on dev
npm run test:staging          # All tests on staging
npm run test:prod             # All tests on prod (READONLY — smoke only)

# Environment × Test Type
npm run test:staging:smoke    # Smoke on staging
npm run test:staging:sanity   # Sanity on staging
npm run test:staging:regression  # Regression on staging
npm run test:dev:smoke        # Smoke on dev
npm run test:prod:smoke       # Smoke on prod

# Setup auth per env
npm run setup:staging         # Re-authenticate on staging
npm run setup:dev             # Re-authenticate on dev
npm run setup:prod            # Re-authenticate on prod
```

### Production Safety

Production config enforces `READONLY_MODE=true`. The `env-guard.helper.ts` helper:
- `shouldSkipDestructive()` — returns `true` on prod, tests can call `test.skip()` for write operations
- Prevents accidental data mutation on production

### Login Methods

Each env can use a different login strategy (`LOGIN_METHOD` in `.env.{env}`):

| Method | Description |
|---|---|
| `cognito` | AWS Cognito email/password form (default) |
| `basic` | Standard username/password form |
| `sso` | SSO redirect via `SSO_PROVIDER_URL` |

## Project Structure

```
QA_Automation/
├── playwright.config.ts          # Playwright configuration (multi-env, projects, reporters)
├── environments/                 # Per-environment config files
│   ├── .env.dev                  #   Dev environment
│   ├── .env.staging              #   Staging environment
│   └── .env.prod                 #   Production environment (READONLY)
├── src/
│   ├── config/
│   │   └── env.config.ts         #   Centralized env loader & validation
│   ├── pages/                    # Page Object Model (POM)
│   │   ├── base.page.ts          #   Base class — common helpers
│   │   └── login.page.ts         #   Login page
│   ├── fixtures/                 # Custom test fixtures
│   │   └── test-fixtures.ts      #   Extended test with POM injection
│   ├── helpers/                  # Utility functions
│   │   ├── api.helper.ts         #   API request wrapper
│   │   ├── auth.helper.ts        #   Per-env auth state loader
│   │   ├── data.helper.ts        #   Test data & CSV parsing
│   │   └── env-guard.helper.ts   #   Production safety guard
│   └── types/                    # TypeScript types
│       └── index.ts
├── tests/
│   ├── auth.setup.ts             # Authentication setup (cognito/basic/sso)
│   ├── e2e/                      # End-to-end UI tests
│   │   └── scheduled-jobs/       #   Scheduled Jobs feature
│   │       └── scheduler-list.spec.ts
│   └── api/                      # API tests
│       └── scheduled-jobs/       #   Scheduled Jobs API
│           └── scheduled-jobs.api.spec.ts
├── test-data/                    # Test data files (JSON)
├── playwright/.auth/             # Per-env auth state (gitignored)
│   ├── staging-user.json
│   └── dev-user.json
├── reports/                      # Per-env test reports (gitignored)
│   ├── staging/html/
│   └── dev/html/
└── scripts/                      # Utility scripts
    └── check-conflicts.ts        #   Cross-sprint conflict checker
```

## Test Tagging Convention

Tests use Playwright tags for selective execution:

| Tag | Meaning | Command |
|---|---|---|
| `@smoke` | Critical path, run on every build | `npm run test:smoke` |
| `@sanity` | Quick verification after deploy | `npm run test:sanity` |
| `@regression` | Full regression suite | `npm run test:regression` |
| `@P1` / `@P2` | Priority from TestRail | `npx playwright test --grep @P1` |
| `@api` | API-only tests | `npm run test:api` |
| `@security` | Security-focused tests | `npx playwright test --grep @security` |

## Page Object Model

All UI tests use POM. Each page has:
1. **Locators** — defined as class properties (not hardcoded in tests)
2. **Actions** — methods that perform user interactions
3. **Assertions** — methods that verify page state

```typescript
// Import from fixtures (not @playwright/test) to get POM injection
import { test, expect } from '../../src/fixtures/test-fixtures';

test('example', async ({ loginPage, page }) => {
  await loginPage.goto();
  await loginPage.login('user@test.com', 'password');
});
```

## Selector Strategy (Priority Order)

1. `data-testid` attributes (most stable)
2. ARIA roles and labels (`getByRole`, `getByLabel`)
3. Text content (`getByText`) — for user-facing strings
4. CSS selectors — last resort for complex layouts

## Integration with QA Ops Director

This test suite integrates with the QA lifecycle managed in the sibling `QA_Agent` repo:
- Test cases originate from `/qa:test-plan` → TestRail CSV (in QA_Agent)
- The `playwright-automator` agent reads CSV and generates tests here
- The `automation-reviewer` agent reviews code across sprints
- Test results can be mapped back to TestRail cases

## Sprint Workflow (via Multi-Root Workspace)

Open `qa-workspace.code-workspace` and use the `playwright-automator` agent:

```
/auto:generate [sprint-folder]    → Generate tests from test cases (reads CSV from QA_Agent)
/auto:inspect [URL]               → Inspect page for selectors
/auto:review                      → Review code quality + conflicts
/auto:run [tag]                   → Run tests by tag
```
