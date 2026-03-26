import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { SchedulerPage } from '../pages/scheduler.page';
import { CleanupHelper } from '../helpers/cleanup.helper';

type TestFixtures = {
  loginPage: LoginPage;
  schedulerPage: SchedulerPage;
  cleanup: CleanupHelper;
};

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  schedulerPage: async ({ page }, use) => {
    await use(new SchedulerPage(page));
  },
  cleanup: async ({}, use) => {
    const helper = new CleanupHelper();
    await use(helper);
    await helper.dispose();
  },
});

export { expect } from '@playwright/test';
