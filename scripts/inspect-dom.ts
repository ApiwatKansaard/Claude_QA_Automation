/**
 * DOM Inspector Script — uses Playwright to load SPA pages
 * and extract real rendered selectors.
 *
 * Usage: npx ts-node scripts/inspect-dom.ts <url> [page-name]
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] || 'https://ekoai-console.staging.ekoapp.com/login';
const pageName = process.argv[3] || 'login';

async function inspectPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log(`\n🔍 Inspecting: ${url}\n`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for SPA to render
  await page.waitForTimeout(3000);

  // Extract all interactive elements
  const elements = await page.evaluate(() => {
    const results: Array<{
      tag: string;
      type?: string;
      id?: string;
      name?: string;
      class?: string;
      placeholder?: string;
      testId?: string;
      ariaLabel?: string;
      role?: string;
      text?: string;
      href?: string;
      xpath: string;
    }> = [];

    const selectors = [
      'input', 'button', 'a', 'select', 'textarea',
      '[role="button"]', '[role="tab"]', '[role="link"]',
      '[role="menuitem"]', '[role="checkbox"]', '[role="switch"]',
      '[data-testid]', 'form', 'table', 'th', 'nav',
      'h1', 'h2', 'h3', 'label',
    ];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;

        // Build xpath
        const getXPath = (element: Element): string => {
          if (element.id) return `//*[@id="${element.id}"]`;
          const parts: string[] = [];
          let current: Element | null = element;
          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling: Element | null = current.previousElementSibling;
            while (sibling) {
              if (sibling.nodeName === current.nodeName) index++;
              sibling = sibling.previousElementSibling;
            }
            const tagName = current.nodeName.toLowerCase();
            const position = index > 0 ? `[${index + 1}]` : '';
            parts.unshift(`${tagName}${position}`);
            current = current.parentElement;
          }
          return '/' + parts.join('/');
        };

        results.push({
          tag: el.tagName.toLowerCase(),
          type: inputEl.type || undefined,
          id: el.id || undefined,
          name: inputEl.name || undefined,
          class: el.className ? String(el.className).substring(0, 120) : undefined,
          placeholder: inputEl.placeholder || undefined,
          testId: htmlEl.dataset?.testid || htmlEl.getAttribute('data-testid') || undefined,
          ariaLabel: htmlEl.getAttribute('aria-label') || undefined,
          role: htmlEl.getAttribute('role') || undefined,
          text: htmlEl.innerText?.substring(0, 80)?.trim() || undefined,
          href: (el as HTMLAnchorElement).href || undefined,
          xpath: getXPath(el),
        });
      });
    }

    // Deduplicate by xpath
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.xpath)) return false;
      seen.add(r.xpath);
      return true;
    });
  });

  console.log(`Found ${elements.length} interactive elements:\n`);
  console.log(JSON.stringify(elements, null, 2));

  // Also get the page title and current URL
  console.log(`\nPage title: ${await page.title()}`);
  console.log(`Current URL: ${page.url()}`);

  // Get the full HTML for reference
  const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 5000));
  console.log(`\n--- Body HTML (first 5000 chars) ---\n${bodyHTML}`);

  await browser.close();
}

inspectPage().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
