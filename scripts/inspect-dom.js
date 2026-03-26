const { chromium } = require('@playwright/test');

const url = process.argv[2] || 'https://ekoai-console.staging.ekoapp.com/login';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const elements = await page.evaluate(() => {
    const results = [];
    const sels = [
      'input', 'button', 'a', 'select', 'textarea',
      '[role="button"]', '[data-testid]', 'form',
      'h1', 'h2', 'h3', 'label', 'nav',
      'span.ant-input-suffix', 'div.ant-form-item',
    ];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el) => {
        results.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || undefined,
          id: el.id || undefined,
          name: el.name || undefined,
          cls: el.className ? String(el.className).substring(0, 150) : undefined,
          placeholder: el.placeholder || undefined,
          testId: el.dataset && el.dataset.testid ? el.dataset.testid : el.getAttribute('data-testid') || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          role: el.getAttribute('role') || undefined,
          text: el.innerText ? el.innerText.substring(0, 120).trim() : undefined,
          href: el.href || undefined,
        });
      });
    }
    const seen = new Set();
    return results.filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  console.log('\n=== ELEMENTS ===');
  console.log(JSON.stringify(elements, null, 2));

  console.log('\nTitle:', await page.title());
  console.log('URL:', page.url());

  const html = await page.evaluate(() => document.body.innerHTML.substring(0, 10000));
  console.log('\n=== HTML (first 10000 chars) ===');
  console.log(html);

  await browser.close();
})();
