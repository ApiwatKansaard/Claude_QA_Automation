#!/usr/bin/env python3
"""
QA Team HTML Report Generator
Reads Playwright results.json → generates standalone team-report.html

Usage:
  python3 scripts/generate_report.py [results_json] [output_html] [project_name] [environment]

Examples:
  python3 scripts/generate_report.py
  python3 scripts/generate_report.py reports/staging/results.json reports/staging/team-report.html "Morning Brief 18.0" staging
"""

import json, sys, math, os, datetime, re, html as html_mod
from pathlib import Path

# ─── Args ───────────────────────────────────────────────────────────────────
args = sys.argv[1:]
RESULTS_JSON  = args[0] if len(args) > 0 else None
OUTPUT_HTML   = args[1] if len(args) > 1 else None
PROJECT_NAME  = args[2] if len(args) > 2 else "EkoAI Console QA"
ENVIRONMENT   = args[3] if len(args) > 3 else "staging"

# Auto-locate results.json
if not RESULTS_JSON:
    candidates = [
        f"reports/{ENVIRONMENT}/results.json",
        "reports/staging/results.json",
        "reports/dev/results.json",
        "test-results/results.json",
        "results.json",
    ]
    for c in candidates:
        if Path(c).exists():
            RESULTS_JSON = c
            break

if not RESULTS_JSON or not Path(RESULTS_JSON).exists():
    print("❌ results.json not found.")
    print("   Run: npx playwright test --reporter=json")
    print(f"   Then: python3 scripts/generate_report.py reports/staging/results.json")
    sys.exit(1)

if not OUTPUT_HTML:
    OUTPUT_HTML = str(Path(RESULTS_JSON).parent / "team-report.html")

# ─── Load JSON ───────────────────────────────────────────────────────────────
with open(RESULTS_JSON, encoding="utf-8") as f:
    data = json.load(f)

# ─── Parse Results ───────────────────────────────────────────────────────────
class TestResult:
    def __init__(self, suite, spec, test, results):
        self.suite    = suite
        self.spec     = spec
        self.test     = test
        self.results  = results

        # Status
        self.status = self._resolve_status()
        self.duration = sum(r.get("duration", 0) for r in results)
        self.retry_count = max(0, len(results) - 1)

        # Annotations
        self.testrail_id = ""
        self.tags = []
        for ann in test.get("annotations", []):
            if ann.get("type") == "TestRail":
                self.testrail_id = ann.get("description", "")
            elif ann.get("type") == "tag":
                self.tags.append(ann.get("description", ""))

        # Extract tags from title too
        title_tags = re.findall(r'@[\w-]+', test.get("title", ""))
        self.tags += [t for t in title_tags if t not in self.tags]

        # Error
        self.error_msg = ""
        self.error_stack = ""
        for r in results:
            err = r.get("error", {})
            if err:
                self.error_msg = err.get("message", "")[:800]
                self.error_stack = err.get("stack", "")[:1200]
                break

        # Steps
        self.steps = []
        for r in results:
            if r.get("steps"):
                self.steps = r["steps"]
                break

        # Attachments
        self.screenshot_path = None
        self.network_log = ""
        for r in results:
            for att in r.get("attachments", []):
                if "screenshot" in att.get("name","").lower() and not self.screenshot_path:
                    self.screenshot_path = att.get("path") or att.get("body")
                if "network" in att.get("name","").lower() and not self.network_log:
                    self.network_log = att.get("body", "")[:2000]

        # Module
        self.module = self._extract_module()
        self.priority = next((t.lstrip('@') for t in self.tags if t in ('@P1','@P2')), "P2")
        self.root_cause = classify_error(self.error_msg + self.error_stack)

    def _resolve_status(self):
        if not self.results:
            return "skipped"
        last = self.results[-1]
        if len(self.results) > 1 and last.get("status") == "passed":
            return "flaky"
        return last.get("status", "unknown")

    def _extract_module(self):
        title = self.suite.get("title", "")
        # "Morning Brief — Dashboard" → "Dashboard"
        if "—" in title:
            return title.split("—", 1)[1].strip()
        if ">" in title:
            return title.split(">")[-1].strip()
        return title.strip() or "General"


def flatten_suites(suites, parent_title=""):
    results = []
    for suite in suites:
        suite_title = suite.get("title", parent_title)
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                test_results = test.get("results", [])
                results.append(TestResult(suite, spec, test, test_results))
        results += flatten_suites(suite.get("suites", []), suite_title)
    return results

def classify_error(msg):
    m = (msg or "").lower()
    if any(k in m for k in ["timeout", "err_", "econnrefused", "network error", "502", "503", "504", "enotfound"]):
        return "INFRA"
    if any(k in m for k in ["already exist", "duplicate", "cannot delete", "stale", "pollution"]):
        return "CLEANUP"
    if any(k in m for k in ["expect", "tohave", "tobe", "assertion failed", "expected", "received"]):
        return "BUG"
    if msg:
        return "BUG"
    return "UNKNOWN"

all_tests = flatten_suites(data.get("suites", []))

# ─── Aggregate Stats ─────────────────────────────────────────────────────────
total   = len(all_tests)
passed  = sum(1 for t in all_tests if t.status == "passed")
failed  = sum(1 for t in all_tests if t.status == "failed")
flaky   = sum(1 for t in all_tests if t.status == "flaky")
skipped = sum(1 for t in all_tests if t.status == "skipped")
total_dur_ms = sum(t.duration for t in all_tests)

def fmt_duration(ms):
    s = ms // 1000
    if s < 60: return f"{s}s"
    return f"{s//60}m {s%60}s"

denominator = total - skipped or 1
pass_pct = (passed + flaky) / denominator * 100

# P1 failures
p1_failures = sum(1 for t in all_tests if t.status == "failed" and "@P1" in t.tags)

# Module breakdown
modules = {}
for t in all_tests:
    m = modules.setdefault(t.module, {"total":0,"passed":0,"failed":0,"flaky":0,"skipped":0})
    m["total"] += 1
    m[t.status if t.status in ("passed","failed","flaky","skipped") else "failed"] += 1

# Issues (failed + flaky)
issues = [t for t in all_tests if t.status in ("failed","flaky")]

# Config info
cfg = data.get("config", {})
workers = cfg.get("workers", 1)
projects = cfg.get("projects", [])
browser_name = ""
for p in projects:
    use = p.get("use",{})
    if use.get("browserName") or use.get("channel"):
        browser_name = use.get("browserName","") or use.get("channel","") or "chromium"
        break
if not browser_name:
    browser_name = "chromium"

# Verdict
def get_verdict():
    if pass_pct >= 80 and p1_failures == 0:
        return "go", "✅ GO — พร้อม Release", "ผลทดสอบผ่านตามเกณฑ์ (≥80% pass, ไม่มี P1 failures)"
    if pass_pct >= 60 and p1_failures == 0:
        return "conditional", "⚠️ CONDITIONAL GO", "ผ่านแบบมีเงื่อนไข — ตรวจสอบ flaky tests และ P2 failures ก่อน release"
    return "nogo", "❌ NO-GO", f"ไม่พร้อม Release — pass rate {pass_pct:.0f}% (ต่ำกว่า 60%) หรือมี {p1_failures} P1 failures"

verdict_cls, verdict_text, verdict_desc = get_verdict()

# Auto recommendations
recs = []
infra_count = sum(1 for t in issues if t.root_cause == "INFRA")
bug_count   = sum(1 for t in issues if t.root_cause == "BUG")
cleanup_count = sum(1 for t in issues if t.root_cause == "CLEANUP")

if infra_count > 0:
    recs.append(("🔧", "INFRA", "ตรวจสอบ Staging Environment",
        f"พบ {infra_count} test(s) ที่ล้มเหลวเนื่องจาก infrastructure issues (timeout, network error). ตรวจสอบ staging server health และ API endpoint availability."))
if bug_count > 0:
    recs.append(("🐛", "BUG", "แก้ไข Bug ก่อน Release",
        f"พบ {bug_count} test(s) ที่ล้มเหลวเนื่องจาก assertion failures. ควร prioritize การแก้ไข bugs เหล่านี้ก่อน release โดยเฉพาะ P1 cases."))
if cleanup_count > 0:
    recs.append(("🧹", "CLEANUP", "ทบทวน Test Isolation",
        f"พบ {cleanup_count} test(s) ที่อาจมีปัญหาเรื่อง test data cleanup. ตรวจสอบ afterAll hooks และ cleanup.track() calls."))
if flaky > 0:
    recs.append(("⚡", "FLAKY", "แก้ไข Flaky Tests",
        f"พบ {flaky} flaky test(s) ที่ผ่านใน retry. ตรวจสอบ race conditions, timing issues, และ selector stability."))
if not recs:
    recs.append(("✅", "OK", "ทุกอย่างผ่าน!", "ไม่พบ issues ที่ต้องแก้ไข — พร้อม release."))

# ─── SVG Donut ───────────────────────────────────────────────────────────────
def make_donut(pct, r=80, sw=14):
    c = r + sw + 4
    circ = 2 * math.pi * r
    dash = circ * min(pct, 100) / 100
    color = "#16a34a" if pct >= 80 else "#f59e0b" if pct >= 60 else "#dc2626"
    return f'''<svg width="{2*c}" height="{2*c}" style="display:block;margin:0 auto">
  <circle cx="{c}" cy="{c}" r="{r}" fill="none" stroke="#e5e7eb" stroke-width="{sw}"/>
  <circle cx="{c}" cy="{c}" r="{r}" fill="none" stroke="{color}" stroke-width="{sw}"
    stroke-dasharray="{dash:.1f} {circ:.1f}" stroke-linecap="round"
    transform="rotate(-90 {c} {c})"/>
  <text x="{c}" y="{c-8}" text-anchor="middle" dominant-baseline="middle"
    font-size="26" font-weight="700" fill="{color}">{pct:.0f}%</text>
  <text x="{c}" y="{c+18}" text-anchor="middle" font-size="12" fill="#64748b">Pass Rate</text>
</svg>'''

# ─── HTML Helpers ─────────────────────────────────────────────────────────────
def e(s): return html_mod.escape(str(s or ""))
def status_badge(st):
    cls = {"passed":"passed","failed":"failed","flaky":"flaky","skipped":"skipped"}.get(st,"skipped")
    icon = {"passed":"✓","failed":"✕","flaky":"~","skipped":"–"}.get(st,"–")
    return f'<span class="status-badge {cls}">{icon} {st}</span>'

def rc_badge(rc):
    cls = {"INFRA":"infra","BUG":"bug","CLEANUP":"cleanup","UNKNOWN":"unknown"}.get(rc,"unknown")
    return f'<span class="root-cause-badge {cls}">{rc}</span>'

def priority_tag(p):
    return f'<span class="tag">{e(p)}</span>'

def fmt_ms(ms):
    if ms < 1000: return f"{ms}ms"
    return f"{ms/1000:.1f}s"

def tag_classes(t):
    classes = [f"status-{t.status}"]
    for tag in t.tags:
        slug = tag.lstrip('@').lower().replace(' ','-')
        classes.append(f"tag-{slug}")
    return " ".join(classes)

# ─── Module Bar Chart ─────────────────────────────────────────────────────────
def module_bar_html(name, stats):
    total_m = stats["total"] or 1
    p_pct = stats["passed"] / total_m * 100
    f_pct = stats["failed"] / total_m * 100
    fl_pct = stats["flaky"] / total_m * 100
    pass_rate = (stats["passed"] + stats["flaky"]) / total_m * 100
    return f'''<div class="module-card">
  <div class="module-card-header">
    <span class="module-name">{e(name)}</span>
    <span class="module-count">{stats["total"]} tests</span>
  </div>
  <div class="module-bar">
    <div class="module-bar-fill" style="width:{p_pct:.1f}%;background:#16a34a"></div>
    <div class="module-bar-fill" style="width:{fl_pct:.1f}%;background:#f59e0b"></div>
    <div class="module-bar-fill" style="width:{f_pct:.1f}%;background:#dc2626"></div>
  </div>
  <div class="module-stats">
    <span><span class="dot pass"></span>{stats["passed"]} passed</span>
    <span><span class="dot flaky"></span>{stats["flaky"]} flaky</span>
    <span><span class="dot fail"></span>{stats["failed"]} failed</span>
    <span style="margin-left:auto;font-weight:600;color:{'#16a34a' if pass_rate>=80 else '#f59e0b' if pass_rate>=60 else '#dc2626'}">{pass_rate:.0f}%</span>
  </div>
</div>'''

# ─── Issue Card ───────────────────────────────────────────────────────────────
def issue_card_html(t, idx):
    kind = "warning" if t.status == "flaky" else "danger"
    label = "FLAKY" if t.status == "flaky" else "FAILED"

    network = ""
    if t.network_log:
        network = f'<div class="network-log">{e(t.network_log[:1500])}</div>'

    screenshot = ""
    if t.screenshot_path and Path(t.screenshot_path).exists():
        screenshot = f'<div class="screenshot-container"><img src="{e(t.screenshot_path)}" alt="Screenshot" loading="lazy"/></div>'

    error_block = ""
    if t.error_msg:
        clean_stack = re.sub(r'\x1B\[[0-9;]*m', '', t.error_stack or "")[:800]
        error_block = f'''<div class="error-block">{e(t.error_msg[:400])}
{'─'*40}
{e(clean_stack)}</div>'''

    steps_html = ""
    if t.steps:
        items = "".join(
            f'<li><span class="step-icon">{"✓" if not s.get("error") else "✕"}</span>'
            f'{e(s.get("title","")[:80])}'
            f'<span class="step-dur">{fmt_ms(s.get("duration",0))}</span></li>'
            for s in t.steps[:12]
        )
        steps_html = f'<ul class="step-list">{items}</ul>'

    return f'''<div class="issue-card {kind}" data-idx="{idx}">
  <div class="issue-card-header">
    {rc_badge(t.root_cause)}
    <h3>{e(t.spec.get("title","") or t.test.get("title",""))}</h3>
    <span class="issue-tag {kind}">{label}</span>
    {priority_tag(t.priority)}
  </div>
  <div class="issue-body">
    <div class="issue-meta">
      <div class="meta-item"><div class="meta-label">TestRail</div><div class="meta-value">{e(t.testrail_id) or "—"}</div></div>
      <div class="meta-item"><div class="meta-label">Module</div><div class="meta-value">{e(t.module)}</div></div>
      <div class="meta-item"><div class="meta-label">Duration</div><div class="meta-value">{fmt_ms(t.duration)}</div></div>
      <div class="meta-item"><div class="meta-label">Retries</div><div class="meta-value">{t.retry_count}</div></div>
    </div>
    {network}
    {steps_html}
    {error_block}
    {screenshot}
  </div>
</div>'''

# ─── Test Table Row ───────────────────────────────────────────────────────────
def table_row_html(t, idx):
    tags_html = "".join(f'<span class="tag">{e(tg)}</span>' for tg in t.tags[:4])
    return f'''<tr class="test-row {tag_classes(t)}" data-idx="{idx}" onclick="openModal({idx})">
  <td><span class="test-title-link">{e(t.spec.get("title","") or t.test.get("title",""))}</span>{tags_html}</td>
  <td>{e(t.module)}</td>
  <td>{status_badge(t.status)}</td>
  <td style="font-family:monospace;font-size:12px">{fmt_ms(t.duration)}</td>
  <td style="font-size:12px;color:#64748b">{e(t.testrail_id) or "—"}</td>
</tr>'''

# ─── Modal Data ───────────────────────────────────────────────────────────────
def modal_data_js(tests):
    items = []
    for idx, t in enumerate(tests):
        clean_err = re.sub(r'\x1B\[[0-9;]*m', '', (t.error_msg or "")[:600])
        clean_stack = re.sub(r'\x1B\[[0-9;]*m', '', (t.error_stack or "")[:1000])
        items.append({
            "idx": idx,
            "title": (t.spec.get("title","") or t.test.get("title",""))[:120],
            "module": t.module,
            "status": t.status,
            "duration": fmt_ms(t.duration),
            "testrailId": t.testrail_id,
            "priority": t.priority,
            "rootCause": t.root_cause,
            "errorMsg": clean_err,
            "errorStack": clean_stack[:500],
            "tags": t.tags[:6],
        })
    return "const TESTS=" + json.dumps(items, ensure_ascii=False) + ";"

# ─── Build HTML ───────────────────────────────────────────────────────────────
now = datetime.datetime.now().strftime("%-m/%-d/%Y, %-I:%M:%S %p")
donut_svg = make_donut(pass_pct)

modules_html = "\n".join(module_bar_html(name, stats) for name, stats in sorted(modules.items()))
issues_html  = "\n".join(issue_card_html(t, i) for i, t in enumerate(issues)) if issues else '<p style="color:#64748b;padding:20px">ไม่มี failed/flaky tests 🎉</p>'
table_rows   = "\n".join(table_row_html(t, i) for i, t in enumerate(all_tests))
recs_html    = "\n".join(f'''<div class="rec-card">
  <h4><span class="rec-tag {cls.lower()}">{cls}</span> {icon} {title}</h4>
  <p>{e(body)}</p>
</div>''' for icon,cls,title,body in recs)

filter_tabs_html = """
<div class="filter-tabs">
  <button class="filter-tab active" onclick="filterTable('all',this)">All</button>
  <button class="filter-tab" onclick="filterTable('status-passed',this)">✓ Passed</button>
  <button class="filter-tab" onclick="filterTable('status-failed',this)">✕ Failed</button>
  <button class="filter-tab" onclick="filterTable('status-flaky',this)">~ Flaky</button>
  <button class="filter-tab" onclick="filterTable('tag-smoke',this)">@smoke</button>
  <button class="filter-tab" onclick="filterTable('tag-p1',this)">@P1</button>
  <button class="filter-tab" onclick="filterTable('tag-morning-brief',this)">@morning-brief</button>
</div>"""

modal_js_data = modal_data_js(all_tests)

html = f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(PROJECT_NAME)} QA Report — {e(now)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {{
    --bg:#f8fafc;--card:#ffffff;
    --primary:#0e7c61;--primary-light:#d1fae5;
    --danger:#dc2626;--danger-light:#fee2e2;
    --warning:#f59e0b;--warning-light:#fef3c7;
    --success:#16a34a;--success-light:#dcfce7;
    --muted:#64748b;--border:#e2e8f0;
    --text:#1e293b;--text-secondary:#475569;
    --shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
    --shadow-lg:0 10px 15px -3px rgba(0,0,0,.08),0 4px 6px -4px rgba(0,0,0,.04);
    --radius:12px;
  }}
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:'Noto Sans Thai','Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}}
  .header{{background:linear-gradient(135deg,#064e3b 0%,#0e7c61 50%,#10b981 100%);color:white;padding:40px 0 32px;position:relative;overflow:hidden}}
  .header::before{{content:'';position:absolute;top:-50%;right:-10%;width:500px;height:500px;background:radial-gradient(circle,rgba(255,255,255,.08) 0%,transparent 70%);border-radius:50%}}
  .header-inner{{max-width:1200px;margin:0 auto;padding:0 32px;position:relative;z-index:1}}
  .header-top{{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}}
  .header h1{{font-size:28px;font-weight:700;letter-spacing:-.02em}}
  .header .subtitle{{font-size:15px;opacity:.85;margin-top:4px}}
  .badge-env{{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500}}
  .header-meta{{display:flex;gap:32px;flex-wrap:wrap;font-size:14px;opacity:.9}}
  .header-meta-item{{display:flex;align-items:center;gap:8px}}
  .container{{max-width:1200px;margin:0 auto;padding:32px}}
  .score-row{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}}
  .score-card{{background:var(--card);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow);border:1px solid var(--border);position:relative;overflow:hidden}}
  .score-card::after{{content:'';position:absolute;top:0;left:0;right:0;height:3px}}
  .score-card.total::after{{background:var(--primary)}}
  .score-card.passed::after{{background:var(--success)}}
  .score-card.flaky::after{{background:var(--warning)}}
  .score-card.failed::after{{background:var(--danger)}}
  .score-card .label{{font-size:13px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}}
  .score-card .value{{font-size:40px;font-weight:700;margin:4px 0;line-height:1.1}}
  .score-card .pct{{font-size:14px;font-weight:500;color:var(--muted)}}
  .score-card.total .value{{color:var(--primary)}}
  .score-card.passed .value{{color:var(--success)}}
  .score-card.flaky .value{{color:var(--warning)}}
  .score-card.failed .value{{color:var(--danger)}}
  .charts-section{{display:grid;grid-template-columns:280px 1fr;gap:24px;margin-bottom:32px}}
  @media(max-width:768px){{.charts-section{{grid-template-columns:1fr}}}}
  .ring-card{{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);border:1px solid var(--border);padding:32px;display:flex;flex-direction:column;align-items:center;justify-content:center}}
  .ring-label{{margin-top:16px;font-size:14px;color:var(--muted);font-weight:500}}
  .section{{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);border:1px solid var(--border);margin-bottom:24px;overflow:hidden}}
  .section-header{{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}}
  .section-header h2{{font-size:18px;font-weight:600}}
  .section-header .icon{{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}}
  .section-body{{padding:24px}}
  .module-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
  .module-card{{border:1px solid var(--border);border-radius:10px;padding:20px;transition:box-shadow .15s}}
  .module-card:hover{{box-shadow:var(--shadow-lg)}}
  .module-card-header{{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}}
  .module-name{{font-size:15px;font-weight:600}}
  .module-count{{background:var(--primary-light);color:var(--primary);padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}}
  .module-bar{{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:12px;display:flex}}
  .module-bar-fill{{height:100%;border-radius:3px}}
  .module-stats{{display:flex;gap:16px;font-size:13px;color:var(--text-secondary)}}
  .module-stats span{{display:flex;align-items:center;gap:4px}}
  .dot{{width:8px;height:8px;border-radius:50%;display:inline-block}}
  .dot.pass{{background:var(--success)}}
  .dot.flaky{{background:var(--warning)}}
  .dot.fail{{background:var(--danger)}}
  .issue-card{{border-radius:10px;margin-bottom:20px;overflow:hidden}}
  .issue-card:last-child{{margin-bottom:0}}
  .issue-card.warning{{border:1px solid var(--warning);background:linear-gradient(to bottom,#fffbeb,white)}}
  .issue-card.danger{{border:1px solid var(--danger);background:linear-gradient(to bottom,#fef2f2,white)}}
  .issue-card-header{{padding:16px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}}
  .issue-card.warning .issue-card-header{{background:var(--warning-light);border-bottom:1px solid #fde68a}}
  .issue-card.danger .issue-card-header{{background:var(--danger-light);border-bottom:1px solid #fca5a5}}
  .issue-card-header h3{{font-size:15px;font-weight:600;flex:1}}
  .issue-tag{{padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}}
  .issue-tag.warning{{background:#fef3c7;border:1px solid #fbbf24;color:#92400e}}
  .issue-tag.danger{{background:#fee2e2;border:1px solid #f87171;color:#991b1b}}
  .issue-body{{padding:20px}}
  .issue-meta{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}}
  .meta-item{{background:#f8fafc;border-radius:8px;padding:12px}}
  .meta-label{{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}}
  .meta-value{{font-size:14px;font-weight:500}}
  .network-log{{background:#1e293b;border-radius:8px;padding:16px;margin:16px 0;font-family:'SF Mono','Fira Code',monospace;font-size:12px;line-height:1.8;overflow-x:auto;color:#e2e8f0;white-space:pre-wrap}}
  .error-block{{background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;font-family:monospace;font-size:12px;line-height:1.6;color:#991b1b;overflow-x:auto;white-space:pre-wrap;margin-top:12px}}
  .root-cause-badge{{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:600}}
  .root-cause-badge.infra{{background:#dbeafe;color:#1e40af}}
  .root-cause-badge.bug{{background:#fee2e2;color:#991b1b}}
  .root-cause-badge.cleanup{{background:#fce7f3;color:#9d174d}}
  .root-cause-badge.unknown{{background:#f1f5f9;color:var(--muted)}}
  .screenshot-container{{margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden}}
  .screenshot-container img{{width:100%;display:block}}
  .verdict{{text-align:center;padding:40px}}
  .verdict-badge{{display:inline-flex;align-items:center;gap:12px;padding:16px 40px;border-radius:16px;font-size:22px;font-weight:700;margin-bottom:16px}}
  .verdict-badge.go{{background:var(--success-light);color:#15803d;border:2px solid #86efac}}
  .verdict-badge.conditional{{background:var(--warning-light);color:#92400e;border:2px solid #fbbf24}}
  .verdict-badge.nogo{{background:var(--danger-light);color:#dc2626;border:2px solid #fca5a5}}
  .verdict-desc{{font-size:15px;color:var(--text-secondary);max-width:600px;margin:0 auto}}
  .test-table{{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}}
  .test-table th{{background:#f1f5f9;padding:10px 16px;text-align:left;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:1}}
  .test-table td{{padding:10px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle}}
  .test-row{{cursor:pointer;transition:background .1s}}
  .test-row:hover td{{background:#eef6ff!important}}
  .test-title-link{{font-weight:500;color:var(--primary)}}
  .status-badge{{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:600}}
  .status-badge.passed{{background:var(--success-light);color:#15803d}}
  .status-badge.flaky{{background:var(--warning-light);color:#92400e}}
  .status-badge.failed{{background:var(--danger-light);color:var(--danger)}}
  .status-badge.skipped{{background:#f1f5f9;color:var(--muted)}}
  .tag{{display:inline-block;background:#e0f2fe;color:#0369a1;padding:1px 8px;border-radius:8px;font-size:11px;font-weight:500;margin-left:4px}}
  .rec-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
  .rec-card{{border:1px solid var(--border);border-radius:10px;padding:20px}}
  .rec-card h4{{font-size:14px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px}}
  .rec-card p{{font-size:13px;color:var(--text-secondary);line-height:1.7}}
  .rec-tag{{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}}
  .rec-tag.infra{{background:#dbeafe;color:#1e40af}}
  .rec-tag.cleanup{{background:#fce7f3;color:#9d174d}}
  .rec-tag.bug{{background:#fee2e2;color:#991b1b}}
  .rec-tag.flaky{{background:#fef3c7;color:#92400e}}
  .rec-tag.ok{{background:var(--success-light);color:#15803d}}
  .filter-tabs{{display:flex;gap:8px;flex-wrap:wrap}}
  .filter-tab{{padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:white;transition:all .15s}}
  .filter-tab:hover{{background:#f1f5f9}}
  .filter-tab.active{{background:var(--primary);color:white;border-color:var(--primary)}}
  .hidden{{display:none!important}}
  .footer{{text-align:center;padding:32px;color:var(--muted);font-size:13px;border-top:1px solid var(--border);margin-top:16px}}
  .footer a{{color:var(--primary);text-decoration:none}}
  .modal-overlay{{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;backdrop-filter:blur(2px)}}
  .modal-overlay.open{{display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto}}
  .modal{{background:var(--card);border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);max-width:800px;width:100%;max-height:calc(100vh - 80px);overflow-y:auto}}
  .modal-header{{padding:24px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:16px;position:sticky;top:0;background:var(--card);z-index:1;border-radius:16px 16px 0 0}}
  .modal-header h2{{font-size:16px;font-weight:600;flex:1;line-height:1.4}}
  .modal-close{{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--muted);flex-shrink:0}}
  .modal-close:hover{{background:#f1f5f9;color:var(--text)}}
  .modal-body{{padding:24px}}
  .detail-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}}
  .detail-item{{background:#f8fafc;border-radius:8px;padding:12px}}
  .detail-item .d-label{{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}}
  .detail-item .d-value{{font-size:14px;font-weight:500}}
  .log-block{{background:#1e293b;border-radius:8px;padding:14px;font-family:'SF Mono','Fira Code',monospace;font-size:12px;line-height:1.7;color:#e2e8f0;overflow-x:auto;white-space:pre-wrap;margin-top:12px}}
  @media print{{body{{background:white}}.container{{padding:16px}}.section{{break-inside:avoid}}.filter-tabs{{display:none}}.modal-overlay{{display:none!important}}}}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-inner">
    <div class="header-top">
      <div>
        <h1>{e(PROJECT_NAME)} QA Report</h1>
        <div class="subtitle">Playwright Automation Results — {e(ENVIRONMENT.upper())} Environment</div>
      </div>
      <span class="badge-env">{e(ENVIRONMENT.upper())} Environment</span>
    </div>
    <div class="header-meta">
      <div class="header-meta-item">📅 {e(now)}</div>
      <div class="header-meta-item">⏱️ Duration: {fmt_duration(total_dur_ms)}</div>
      <div class="header-meta-item">💻 Playwright + {e(browser_name.title())}</div>
      <div class="header-meta-item">⚙️ {workers} worker{"s" if workers != 1 else ""}</div>
    </div>
  </div>
</div>

<div class="container">

<!-- SCORE CARDS -->
<div class="score-row">
  <div class="score-card total"><div class="label">Total Tests</div><div class="value">{total}</div><div class="pct">{skipped} skipped</div></div>
  <div class="score-card passed"><div class="label">Passed</div><div class="value">{passed}</div><div class="pct">{passed/max(total,1)*100:.0f}% of total</div></div>
  <div class="score-card flaky"><div class="label">Flaky</div><div class="value">{flaky}</div><div class="pct">passed on retry</div></div>
  <div class="score-card failed"><div class="label">Failed</div><div class="value">{failed}</div><div class="pct">{p1_failures} P1 failures</div></div>
</div>

<!-- CHARTS -->
<div class="charts-section">
  <div class="ring-card">
    {donut_svg}
    <div class="ring-label">{passed + flaky} / {total - skipped} tests passed</div>
  </div>
  <div class="section" style="margin-bottom:0">
    <div class="section-header"><div class="icon">📊</div><h2>Module Breakdown</h2></div>
    <div class="section-body">
      <div class="module-grid">
        {modules_html}
      </div>
    </div>
  </div>
</div>

<!-- ISSUES -->
<div class="section">
  <div class="section-header">
    <div class="icon" style="background:#fee2e2">🔴</div>
    <h2>Issues — {len(issues)} test{"s" if len(issues)!=1 else ""} require attention</h2>
  </div>
  <div class="section-body">
    {issues_html}
  </div>
</div>

<!-- FULL TEST TABLE -->
<div class="section">
  <div class="section-header">
    <div class="icon" style="background:#dbeafe">📋</div>
    <h2>All Tests</h2>
    <div style="margin-left:auto">{filter_tabs_html}</div>
  </div>
  <div style="overflow-x:auto">
    <table class="test-table">
      <thead><tr>
        <th>Test</th><th>Module</th><th>Status</th><th>Duration</th><th>TestRail</th>
      </tr></thead>
      <tbody id="test-tbody">
        {table_rows}
      </tbody>
    </table>
  </div>
</div>

<!-- RECOMMENDATIONS -->
<div class="section">
  <div class="section-header"><div class="icon" style="background:#dcfce7">💡</div><h2>Recommendations</h2></div>
  <div class="section-body"><div class="rec-grid">{recs_html}</div></div>
</div>

<!-- VERDICT -->
<div class="section">
  <div class="section-header"><div class="icon">🏁</div><h2>Release Verdict</h2></div>
  <div class="verdict">
    <div class="verdict-badge {verdict_cls}">{verdict_text}</div>
    <p class="verdict-desc">{e(verdict_desc)}</p>
    <p style="margin-top:12px;font-size:13px;color:var(--muted)">
      Pass rate: <strong>{pass_pct:.1f}%</strong> &nbsp;|&nbsp;
      P1 failures: <strong>{p1_failures}</strong> &nbsp;|&nbsp;
      Total: <strong>{total}</strong> tests
    </p>
  </div>
</div>

</div><!-- /container -->

<div class="footer">
  Generated by <a href="https://claude.ai/claude-code">Claude Code QA Agent</a> &nbsp;·&nbsp;
  {e(now)} &nbsp;·&nbsp;
  Sprint: <strong>{e(PROJECT_NAME)}</strong>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modal-overlay" onclick="closeModalOutside(event)">
  <div class="modal" id="modal">
    <div class="modal-header">
      <h2 id="modal-title"></h2>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<script>
{modal_js_data}

function filterTable(cls, btn) {{
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#test-tbody .test-row').forEach(row => {{
    if (cls === 'all' || row.classList.contains(cls)) {{
      row.classList.remove('hidden');
    }} else {{
      row.classList.add('hidden');
    }}
  }});
}}

function openModal(idx) {{
  const t = TESTS[idx];
  if (!t) return;
  document.getElementById('modal-title').textContent = t.title;
  const rcBadge = `<span class="root-cause-badge ${{t.rootCause.toLowerCase()}}">${{t.rootCause}}</span>`;
  const tagsHtml = t.tags.map(tag => `<span class="tag">${{tag}}</span>`).join('');
  document.getElementById('modal-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="d-label">Status</div><div class="d-value">${{t.status}}</div></div>
      <div class="detail-item"><div class="d-label">Module</div><div class="d-value">${{t.module}}</div></div>
      <div class="detail-item"><div class="d-label">Duration</div><div class="d-value">${{t.duration}}</div></div>
      <div class="detail-item"><div class="d-label">TestRail</div><div class="d-value">${{t.testrailId || '—'}}</div></div>
      <div class="detail-item"><div class="d-label">Priority</div><div class="d-value">${{t.priority}}</div></div>
      <div class="detail-item"><div class="d-label">Root Cause</div><div class="d-value">${{rcBadge}}</div></div>
    </div>
    <div style="margin-bottom:12px">${{tagsHtml}}</div>
    ${{t.errorMsg ? `<div class="error-block">${{escHtml(t.errorMsg)}}\\n${{escHtml(t.errorStack)}}</div>` : ''}}
  `;
  document.getElementById('modal-overlay').classList.add('open');
}}

function closeModal() {{ document.getElementById('modal-overlay').classList.remove('open'); }}
function closeModalOutside(e) {{ if (e.target.id === 'modal-overlay') closeModal(); }}
document.addEventListener('keydown', e => {{ if (e.key === 'Escape') closeModal(); }});
function escHtml(s) {{
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}}
</script>
</body>
</html>"""

# ─── Write Output ─────────────────────────────────────────────────────────────
os.makedirs(Path(OUTPUT_HTML).parent, exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

print(f"\n{'='*60}")
print(f"✅ QA Report generated: {OUTPUT_HTML}")
print(f"{'='*60}")
print(f"  Total:   {total}")
print(f"  Passed:  {passed}  ({passed/max(total,1)*100:.0f}%)")
print(f"  Flaky:   {flaky}")
print(f"  Failed:  {failed}  (P1: {p1_failures})")
print(f"  Pass rate: {pass_pct:.1f}%")
print(f"  Verdict:  {verdict_text}")
print(f"{'='*60}")

# Open in browser (macOS)
try:
    import subprocess
    subprocess.run(["open", OUTPUT_HTML], check=False)
except Exception:
    pass
