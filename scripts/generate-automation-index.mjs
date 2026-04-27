#!/usr/bin/env node
/**
 * Walk tests/ and emit a single self-contained HTML index of every automated test
 * (title, tags, TestRail/Jira annotations, run command).
 *
 * Output: reports/automation-index.html
 *
 * Usage:
 *   node scripts/generate-automation-index.mjs
 *
 * Re-run any time tests are added/removed; the file is fully static (open in any
 * browser, share with QA teammates, no server required).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TESTS_DIR = join(REPO_ROOT, "tests");
const OUTPUT = join(REPO_ROOT, "reports", "automation-index.html");

// ── Walk ─────────────────────────────────────────────────────────────────────
function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, files);
    else if (entry.endsWith(".spec.ts")) files.push(full);
  }
  return files;
}

// ── Parse one spec file (regex-based; tolerant) ──────────────────────────────
/** Parse `test('title', { annotation: ..., tag: [...] }, ...)` blocks. */
function parseSpec(filePath, src) {
  const fileSummary = (src.match(/^\s*\*\s*(API|UI|E2E|Test)[^\n]*$/m) || [])[0]?.replace(/^\s*\*\s*/, "").trim() || "";
  const testRailRange = (src.match(/C\d{6,}[^\n]*?C\d{6,}/) || [])[0] || "";

  const describeMatch = src.match(/test\.describe\(\s*['"`]([^'"`]+)['"`]/);
  const describe = describeMatch ? describeMatch[1] : "";

  const tests = [];
  // Match `test('title', { ...options... }, async (...) => { ... })`.
  // Non-greedy on outer block would stop at the first `}` (inside annotation), so
  // we anchor to the trailing `async` (or `(async`) instead — which all tests use.
  const testRegex = /test\(\s*\n?\s*['"`]([^'"`]+)['"`]\s*,\s*(\{[\s\S]*?\}),\s*\n?\s*\(?async\s*\(/g;
  let m;
  while ((m = testRegex.exec(src)) !== null) {
    const title = m[1];
    const optsBlock = m[2];

    // Extract annotation TestRail / Jira
    const trMatches = [...optsBlock.matchAll(/type:\s*['"`]TestRail['"`]\s*,\s*description:\s*['"`]([^'"`]+)['"`]/g)];
    const jiraMatches = [...optsBlock.matchAll(/type:\s*['"`]Jira['"`]\s*,\s*description:\s*['"`]([^'"`]+)['"`]/g)];

    // Tags: tag: ['@smoke', '@P1']
    const tagMatch = optsBlock.match(/tag:\s*\[([^\]]*)\]/);
    const tags = tagMatch ? [...tagMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(t => t[1]) : [];

    tests.push({
      title,
      tags,
      testRail: trMatches.map(t => t[1]),
      jira: jiraMatches.map(t => t[1]),
    });
  }

  return { describe, fileSummary, testRailRange, tests };
}

// ── Build dataset ────────────────────────────────────────────────────────────
const files = walk(TESTS_DIR).sort();
const dataset = [];
for (const f of files) {
  const rel = relative(REPO_ROOT, f);
  const src = readFileSync(f, "utf8");
  const parsed = parseSpec(f, src);
  if (parsed.tests.length === 0) continue;

  // Group by top-level category (api / e2e) and second segment (agentic / ekoai-console / etc.)
  const segments = rel.split("/");
  const category = segments[1] || "other";       // api | e2e
  const product = segments[2] || "";              // agentic | ekoai-console | ...
  const module = segments[3] || "";               // morning-brief | scheduled-jobs | ...

  dataset.push({
    file: rel,
    category,
    product,
    module,
    describe: parsed.describe,
    summary: parsed.fileSummary,
    testRailRange: parsed.testRailRange,
    tests: parsed.tests,
  });
}

const totalTests = dataset.reduce((n, f) => n + f.tests.length, 0);
const totalFiles = dataset.length;

// Aggregate counts
const tagCounts = {};
const productCounts = {};
const moduleCounts = {};
let withTestRail = 0;
let withJira = 0;
for (const f of dataset) {
  productCounts[f.product] = (productCounts[f.product] || 0) + f.tests.length;
  const modKey = `${f.product}/${f.module}`;
  moduleCounts[modKey] = (moduleCounts[modKey] || 0) + f.tests.length;
  for (const t of f.tests) {
    for (const tag of t.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    if (t.testRail.length) withTestRail++;
    if (t.jira.length) withJira++;
  }
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const escape = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const tagBadge = tag => {
  const cls =
    tag === "@smoke"     ? "bg-green-100 text-green-800" :
    tag === "@sanity"    ? "bg-blue-100 text-blue-800" :
    tag === "@regression"? "bg-purple-100 text-purple-800" :
    tag === "@P1"        ? "bg-red-100 text-red-800" :
    tag === "@P2"        ? "bg-amber-100 text-amber-800" :
    tag === "@security"  ? "bg-pink-100 text-pink-800" :
                           "bg-gray-100 text-gray-700";
  return `<span class="px-2 py-0.5 rounded text-xs font-medium ${cls}">${escape(tag)}</span>`;
};

const trBadge = id => `<a href="https://ekoap.testrail.com/index.php?/cases/view/${escape(id.replace(/^C/, ""))}" target="_blank" class="px-2 py-0.5 rounded text-xs font-mono bg-indigo-100 text-indigo-800 hover:bg-indigo-200">${escape(id)}</a>`;
const jiraBadge = id => `<a href="https://ekoapp.atlassian.net/browse/${escape(id)}" target="_blank" class="px-2 py-0.5 rounded text-xs font-mono bg-cyan-100 text-cyan-800 hover:bg-cyan-200">${escape(id)}</a>`;

const generated = new Date().toISOString();
const productList = Object.entries(productCounts).sort((a,b) => b[1]-a[1]);
const moduleList = Object.entries(moduleCounts).sort((a,b) => b[1]-a[1]);
const tagList = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]);

const fileSections = dataset.map(f => {
  const testRows = f.tests.map((t, idx) => `
    <tr class="test-row hover:bg-slate-50 border-t border-slate-100"
        data-tags="${t.tags.join(' ')}"
        data-search="${escape((t.title + ' ' + t.tags.join(' ') + ' ' + t.testRail.join(' ') + ' ' + t.jira.join(' ') + ' ' + f.file).toLowerCase())}">
      <td class="py-2 px-3 align-top text-sm text-slate-800">${escape(t.title)}</td>
      <td class="py-2 px-3 align-top whitespace-nowrap">${t.tags.map(tagBadge).join(' ') || '<span class="text-slate-300 text-xs">—</span>'}</td>
      <td class="py-2 px-3 align-top whitespace-nowrap">${t.testRail.map(trBadge).join(' ') || '<span class="text-slate-300 text-xs">—</span>'}</td>
      <td class="py-2 px-3 align-top whitespace-nowrap">${t.jira.map(jiraBadge).join(' ') || '<span class="text-slate-300 text-xs">—</span>'}</td>
      <td class="py-2 px-3 align-top whitespace-nowrap">
        <button onclick="copyTest('${escape(f.file)}', ${JSON.stringify(t.title).replace(/"/g, '&quot;')}, 'sh')"
                class="px-2 py-0.5 bg-slate-700 text-white text-[10px] rounded hover:bg-slate-600"
                title="Copy shell command to run JUST this test">▶ sh</button>
        <button onclick="copyTest('${escape(f.file)}', ${JSON.stringify(t.title).replace(/"/g, '&quot;')}, 'claude')"
                class="px-2 py-0.5 bg-indigo-600 text-white text-[10px] rounded hover:bg-indigo-500"
                title="Copy as Claude Code prompt">🤖 claude</button>
      </td>
    </tr>`).join('');

  return `
  <section class="file-section bg-white rounded-lg border border-slate-200 overflow-hidden mb-4"
           data-product="${escape(f.product)}" data-module="${escape(f.module)}">
    <header class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="font-mono text-xs text-slate-500 truncate">${escape(f.file)}</div>
        <div class="font-semibold text-slate-800 mt-0.5">${escape(f.describe || f.module || '(unnamed)')}</div>
        ${f.summary ? `<div class="text-xs text-slate-500 mt-0.5">${escape(f.summary)}</div>` : ''}
      </div>
      <div class="text-right text-xs text-slate-600 shrink-0">
        <div><span class="font-semibold">${f.tests.length}</span> tests</div>
        ${f.testRailRange ? `<div class="font-mono text-indigo-700 mt-0.5">${escape(f.testRailRange)}</div>` : ''}
        <div class="mt-2 flex flex-col gap-1 items-end">
          <button onclick="copyFile('${escape(f.file)}', 'sh')" class="px-2 py-1 bg-slate-800 text-white text-xs rounded hover:bg-slate-700" title="Copy shell command — runs ALL tests in this file">▶ copy sh</button>
          <button onclick="copyFile('${escape(f.file)}', 'claude')" class="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500" title="Copy Claude Code prompt — paste in any session">🤖 copy claude</button>
        </div>
      </div>
    </header>
    <table class="w-full">
      <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
        <tr>
          <th class="text-left py-2 px-3 font-medium">Test title</th>
          <th class="text-left py-2 px-3 font-medium w-48">Tags</th>
          <th class="text-left py-2 px-3 font-medium w-40">TestRail</th>
          <th class="text-left py-2 px-3 font-medium w-32">Jira</th>
          <th class="text-left py-2 px-3 font-medium w-32">Run</th>
        </tr>
      </thead>
      <tbody>${testRows}</tbody>
    </table>
  </section>`;
}).join('');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Automation Index — Claude_QA_Automation</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 text-slate-900 min-h-screen">
  <div class="max-w-7xl mx-auto px-4 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">📋 Automation Index</h1>
      <p class="text-sm text-slate-600 mt-1">Searchable catalog of every automated Playwright test in this repo.</p>
      <p class="text-xs text-slate-500 mt-2">Generated <code>${escape(generated)}</code> · regenerate with <code class="bg-slate-200 px-1 rounded">node scripts/generate-automation-index.mjs</code></p>
    </header>

    <!-- Stats cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-2xl font-bold text-slate-900">${totalTests}</div>
        <div class="text-xs text-slate-500 uppercase mt-1">Total tests</div>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-2xl font-bold text-slate-900">${totalFiles}</div>
        <div class="text-xs text-slate-500 uppercase mt-1">Spec files</div>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-2xl font-bold text-indigo-700">${withTestRail}</div>
        <div class="text-xs text-slate-500 uppercase mt-1">With TestRail ID</div>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-2xl font-bold text-cyan-700">${withJira}</div>
        <div class="text-xs text-slate-500 uppercase mt-1">With Jira link</div>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-2xl font-bold text-green-700">${tagCounts['@smoke'] || 0}</div>
        <div class="text-xs text-slate-500 uppercase mt-1">Smoke tests</div>
      </div>
    </div>

    <!-- How to run -->
    <details class="mb-6 bg-white rounded-lg border border-slate-200" open>
      <summary class="px-4 py-3 cursor-pointer font-semibold text-slate-800 hover:bg-slate-50">▶ How to run</summary>
      <div class="px-4 py-3 text-sm space-y-3 border-t border-slate-100">
        <div class="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
          <strong>Per-file / per-test buttons</strong> appear on the right of every section and row below:
          <ul class="list-disc ml-5 mt-1">
            <li><span class="font-mono bg-slate-800 text-white px-1 rounded">▶ sh</span> — copies a self-contained shell command (cd + refresh token + run); paste into any terminal.</li>
            <li><span class="font-mono bg-indigo-600 text-white px-1 rounded">🤖 claude</span> — copies a natural-language prompt; paste into a Claude Code session.</li>
          </ul>
        </div>
        <div>
          <div class="font-mono text-xs text-slate-500 mb-1">All Morning Brief + Scheduled Jobs (skip sharepoint):</div>
          <code class="block bg-slate-900 text-green-300 p-3 rounded text-xs overflow-x-auto">npm run test:morning-brief</code>
        </div>
        <div>
          <div class="font-mono text-xs text-slate-500 mb-1">Smoke only:</div>
          <code class="block bg-slate-900 text-green-300 p-3 rounded text-xs">npm run test:staging:smoke</code>
        </div>
        <div>
          <div class="font-mono text-xs text-slate-500 mb-1">First time / token expired (refresh Cognito token):</div>
          <code class="block bg-slate-900 text-green-300 p-3 rounded text-xs">npm run setup:staging</code>
        </div>
      </div>
    </details>

    <!-- Filters -->
    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-6">
      <input id="search" type="search" placeholder="🔎 Search title, tag, TestRail ID (Cxxx), Jira (AE-xxx), or file path…"
             class="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
      <div class="flex flex-wrap gap-2 mt-3">
        <button class="filter-btn px-3 py-1 rounded text-xs font-medium bg-slate-800 text-white" data-tag="">All <span class="opacity-60">${totalTests}</span></button>
        ${tagList.map(([tag, n]) => `<button class="filter-btn px-3 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200" data-tag="${escape(tag)}">${escape(tag)} <span class="opacity-60">${n}</span></button>`).join('')}
      </div>
      <div class="flex flex-wrap gap-2 mt-2">
        <button class="product-btn px-3 py-1 rounded text-xs bg-slate-100 text-slate-700 hover:bg-slate-200" data-product="">all products</button>
        ${productList.map(([p, n]) => `<button class="product-btn px-3 py-1 rounded text-xs bg-slate-100 text-slate-700 hover:bg-slate-200" data-product="${escape(p)}">${escape(p)} <span class="opacity-60">${n}</span></button>`).join('')}
      </div>
    </div>

    <!-- Sections -->
    ${fileSections}

    <footer class="mt-8 text-xs text-slate-500 text-center pb-8">
      <p>Claude_QA_Automation · ${totalTests} automated tests across ${totalFiles} files</p>
      <p class="mt-1">Hand this file to any QA — just open in a browser, no install needed.</p>
    </footer>
  </div>

  <script>
  const search = document.getElementById('search');
  let activeTag = '';
  let activeProduct = '';

  function applyFilter() {
    const q = (search.value || '').toLowerCase();
    document.querySelectorAll('.test-row').forEach(row => {
      const blob = row.dataset.search;
      const tags = (row.dataset.tags || '').split(' ');
      const matchesQ = !q || blob.includes(q);
      const matchesTag = !activeTag || tags.includes(activeTag);
      row.style.display = (matchesQ && matchesTag) ? '' : 'none';
    });
    document.querySelectorAll('.file-section').forEach(sec => {
      const matchesProduct = !activeProduct || sec.dataset.product === activeProduct;
      const visibleRows = sec.querySelectorAll('.test-row:not([style*="none"])').length;
      sec.style.display = (matchesProduct && visibleRows > 0) ? '' : 'none';
    });
  }
  search.addEventListener('input', applyFilter);
  document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    activeTag = btn.dataset.tag;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('bg-slate-800', b.dataset.tag === activeTag);
      b.classList.toggle('text-white', b.dataset.tag === activeTag);
      b.classList.toggle('bg-slate-100', b.dataset.tag !== activeTag);
      b.classList.toggle('text-slate-700', b.dataset.tag !== activeTag);
    });
    applyFilter();
  }));
  document.querySelectorAll('.product-btn').forEach(btn => btn.addEventListener('click', () => {
    activeProduct = btn.dataset.product;
    document.querySelectorAll('.product-btn').forEach(b => {
      b.classList.toggle('bg-indigo-600', b.dataset.product === activeProduct);
      b.classList.toggle('text-white', b.dataset.product === activeProduct);
      b.classList.toggle('bg-slate-100', b.dataset.product !== activeProduct);
      b.classList.toggle('text-slate-700', b.dataset.product !== activeProduct);
    });
    applyFilter();
  }));

  // Repo absolute path — adjust if cloned somewhere else.
  const REPO = '/Users/amity/Documents/Claude_QA_Automation';

  // Robust shell command: cd to repo, refresh token (silent), run tests.
  // Works whether or not the user is in the repo dir or has a fresh token.
  function shCmd(testTarget, grep) {
    const grepArg = grep ? ' --grep ' + JSON.stringify(grep).replace(/"/g, "'") : '';
    return 'cd ' + REPO + ' && \\\n' +
      '  TEST_ENV=staging PW_HTML_OPEN=never npx playwright test --project=setup --reporter=line && \\\n' +
      '  TEST_ENV=staging npx playwright test ' + testTarget + grepArg;
  }

  // Claude Code prompt — natural language; Claude will translate to the right command.
  function claudePrompt(testTarget, grep) {
    return 'รันเทส Playwright ไฟล์นี้: ' + testTarget +
      (grep ? ' เฉพาะเคส "' + grep + '"' : '') +
      '. (cwd: ' + REPO + ', env: staging, refresh token ก่อนถ้าหมดอายุ)';
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.className = 'fixed top-4 right-4 bg-slate-800 text-white px-4 py-2 rounded shadow-lg text-sm z-50 max-w-xl whitespace-pre';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function copyFile(file, mode) {
    const cmd = mode === 'claude' ? claudePrompt(file) : shCmd(file);
    navigator.clipboard.writeText(cmd).then(() => toast('📋 Copied (' + mode + '):\\n' + cmd));
  }
  function copyTest(file, title, mode) {
    const cmd = mode === 'claude' ? claudePrompt(file, title) : shCmd(file, title);
    navigator.clipboard.writeText(cmd).then(() => toast('📋 Copied (' + mode + '):\\n' + cmd));
  }
  window.copyFile = copyFile;
  window.copyTest = copyTest;
  window.copyCmd = copyFile; // back-compat
  </script>
</body>
</html>`;

if (!existsSync(dirname(OUTPUT))) mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, html);

console.log(`✅ Automation index generated`);
console.log(`   → ${OUTPUT}`);
console.log(`   ${totalTests} tests across ${totalFiles} files`);
console.log(`   ${withTestRail} with TestRail · ${withJira} with Jira`);
console.log(`   open with: open ${OUTPUT.replace(REPO_ROOT + "/", "")}`);
