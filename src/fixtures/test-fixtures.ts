import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { SchedulerPage } from '../pages/agentic/scheduler.page';
import { CreateWizardPage } from '../pages/agentic/scheduled-jobs/create-wizard.page';
import { JobConfigPage } from '../pages/agentic/scheduled-jobs/job-config.page';
import { RecipientsPage } from '../pages/agentic/scheduled-jobs/recipients.page';
import { HistoryLogsPage } from '../pages/agentic/scheduled-jobs/history-logs.page';
import { CleanupHelper } from '../helpers/cleanup.helper';

type TestFixtures = {
  loginPage: LoginPage;
  schedulerPage: SchedulerPage;
  createWizardPage: CreateWizardPage;
  jobConfigPage: JobConfigPage;
  recipientsPage: RecipientsPage;
  historyLogsPage: HistoryLogsPage;
  cleanup: CleanupHelper;
};

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  schedulerPage: async ({ page }, use) => {
    await use(new SchedulerPage(page));
  },
  createWizardPage: async ({ page }, use) => {
    await use(new CreateWizardPage(page));
  },
  jobConfigPage: async ({ page }, use) => {
    await use(new JobConfigPage(page));
  },
  recipientsPage: async ({ page }, use) => {
    await use(new RecipientsPage(page));
  },
  historyLogsPage: async ({ page }, use) => {
    await use(new HistoryLogsPage(page));
  },
  cleanup: async ({}, use) => {
    const helper = new CleanupHelper();
    await use(helper);
    await helper.dispose();
  },
});

export { expect } from '@playwright/test';
