require('dotenv').config();
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture API requests
  const apiRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('/v1/') || url.includes('/graphql') || url.includes('/scheduled') || url.includes('/task')) {
      apiRequests.push({ method: req.method(), url, headers: req.headers() });
    }
  });

  // Login
  console.log('Logging in...');
  await page.goto('https://ekoai-console.staging.ekoapp.com/login', { waitUntil: 'networkidle' });
  await page.fill('#username', process.env.TEST_USERNAME);
  await page.fill('#password', process.env.TEST_PASSWORD);
  await page.click('[data-testid="test-login-btn"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('Logged in. URL:', page.url());

  // Navigate to AI Task Scheduler
  console.log('\nNavigating to AI Task Scheduler...');
  await page.goto('https://ekoai-console.staging.ekoapp.com/ai-task-scheduler', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());

  // Screenshot
  await page.screenshot({ path: 'scripts/scheduler-screenshot.png', fullPage: true });
  console.log('Screenshot saved');

  // Extract all interactive elements
  const elements = await page.evaluate(() => {
    const els = document.querySelectorAll('button, input, select, a, table, th, td, .ant-table, .ant-btn, .ant-card, [data-testid], [role="tab"], [role="row"], h1, h2, h3, h4');
    return Array.from(els).slice(0, 60).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      cls: (typeof el.className === 'string' ? el.className : el.className?.baseVal || '').substring(0, 120),
      testId: el.getAttribute('data-testid'),
      text: el.textContent?.trim().substring(0, 150),
      href: el.getAttribute('href'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      role: el.getAttribute('role'),
    }));
  });
  console.log('\n=== SCHEDULER PAGE ELEMENTS ===');
  console.log(JSON.stringify(elements, null, 2));

  // Extract table structure specifically
  const tableData = await page.evaluate(() => {
    const table = document.querySelector('.ant-table, table');
    if (!table) return 'No table found';
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim());
    const firstRows = Array.from(table.querySelectorAll('tbody tr')).slice(0, 3).map(tr => {
      return Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim().substring(0, 80));
    });
    return { headers, firstRows };
  });
  console.log('\n=== TABLE STRUCTURE ===');
  console.log(JSON.stringify(tableData, null, 2));

  // Print API requests
  console.log('\n=== API REQUESTS ===');
  const uniqueApis = apiRequests.map(r => ({ method: r.method, url: r.url }));
  console.log(JSON.stringify(uniqueApis, null, 2));

  // Print auth headers for API testing
  if (apiRequests.length > 0) {
    const authHeader = apiRequests[0].headers['authorization'] || apiRequests[0].headers['Authorization'];
    if (authHeader) {
      console.log('\n=== AUTH TOKEN (first 50 chars) ===');
      console.log(authHeader.substring(0, 50) + '...');
    }
  }

  // HTML outline
  const html = await page.evaluate(() => document.body.innerHTML.substring(0, 10000));
  console.log('\n=== HTML (first 10000) ===');
  console.log(html);

  await browser.close();
})();
