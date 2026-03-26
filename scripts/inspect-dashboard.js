require('dotenv').config();
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to login
  console.log('Navigating to login...');
  await page.goto('https://ekoai-console.staging.ekoapp.com/login', { waitUntil: 'networkidle' });

  // Fill login form
  console.log('Logging in...');
  await page.fill('#username', process.env.TEST_USERNAME);
  await page.fill('#password', process.env.TEST_PASSWORD);
  await page.click('[data-testid="test-login-btn"]');

  // Wait for navigation after login
  console.log('Waiting for dashboard...');
  await page.waitForURL('**/dashboard**', { timeout: 30000 }).catch(() => {
    console.log('Did not redirect to /dashboard, checking current URL...');
  });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);
  console.log('Title:', await page.title());

  // Take screenshot
  await page.screenshot({ path: 'scripts/dashboard-screenshot.png', fullPage: true });
  console.log('Screenshot saved to scripts/dashboard-screenshot.png');

  // Extract sidebar navigation
  const sidebar = await page.evaluate(() => {
    const navItems = document.querySelectorAll('a[href], [role="menuitem"], nav a, .ant-menu-item, .ant-menu-submenu-title');
    return Array.from(navItems).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().substring(0, 100),
      href: el.getAttribute('href'),
      cls: el.className?.substring(0, 120),
      testId: el.getAttribute('data-testid'),
      role: el.getAttribute('role'),
    })).filter(e => e.text);
  });
  console.log('\n=== SIDEBAR/NAV ===');
  console.log(JSON.stringify(sidebar, null, 2));

  // Extract main content area
  const mainContent = await page.evaluate(() => {
    const elements = document.querySelectorAll('table, .ant-table, .ant-card, .ant-list, h1, h2, h3, h4, [class*="title"], [class*="header"], [data-testid]');
    return Array.from(elements).map(el => ({
      tag: el.tagName.toLowerCase(),
      cls: el.className?.substring(0, 150),
      testId: el.getAttribute('data-testid'),
      text: el.textContent?.trim().substring(0, 200),
      children: el.children.length,
    }));
  });
  console.log('\n=== MAIN CONTENT ===');
  console.log(JSON.stringify(mainContent, null, 2));

  // Look for scheduled jobs related elements
  const scheduledJobsElements = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const results = [];
    for (const el of all) {
      const text = el.textContent?.trim() || '';
      const cls = el.className || '';
      const testId = el.getAttribute('data-testid') || '';
      if ((text.toLowerCase().includes('schedul') || text.toLowerCase().includes('job') || 
           cls.toLowerCase().includes('schedul') || cls.toLowerCase().includes('job') ||
           testId.toLowerCase().includes('schedul') || testId.toLowerCase().includes('job')) &&
          el.children.length < 5) {
        results.push({
          tag: el.tagName.toLowerCase(),
          cls: typeof cls === 'string' ? cls.substring(0, 120) : '',
          testId,
          text: text.substring(0, 200),
          id: el.id,
        });
      }
    }
    return results.slice(0, 30);
  });
  console.log('\n=== SCHEDULED JOBS ELEMENTS ===');
  console.log(JSON.stringify(scheduledJobsElements, null, 2));

  // Capture network requests (APIs)
  const apiRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/') || req.url().includes('/v1/') || req.url().includes('/graphql')) {
      apiRequests.push({ method: req.method(), url: req.url() });
    }
  });

  // Navigate to scheduled jobs if there's a link
  const schedLink = await page.$('a[href*="schedule"], a[href*="job"]');
  if (schedLink) {
    console.log('\nFound scheduled jobs link, clicking...');
    await schedLink.click();
    await page.waitForTimeout(3000);
    console.log('URL after click:', page.url());

    const jobsPageContent = await page.evaluate(() => {
      const elements = document.querySelectorAll('table, .ant-table, .ant-card, .ant-list, [data-testid], button, .ant-btn, th, td');
      return Array.from(elements).slice(0, 40).map(el => ({
        tag: el.tagName.toLowerCase(),
        cls: el.className?.substring(0, 120),
        testId: el.getAttribute('data-testid'),
        text: el.textContent?.trim().substring(0, 150),
      }));
    });
    console.log('\n=== SCHEDULED JOBS PAGE ===');
    console.log(JSON.stringify(jobsPageContent, null, 2));
  }

  // Print captured API calls
  if (apiRequests.length > 0) {
    console.log('\n=== API REQUESTS ===');
    console.log(JSON.stringify(apiRequests, null, 2));
  }

  // Dump full HTML body outline
  const bodyOutline = await page.evaluate(() => {
    return document.body.innerHTML.substring(0, 15000);
  });
  console.log('\n=== HTML BODY (first 15000 chars) ===');
  console.log(bodyOutline);

  await browser.close();
})();
