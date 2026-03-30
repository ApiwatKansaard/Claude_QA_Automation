#!/usr/bin/env python3
"""
Risk Story Report Generator
=============================
Reads Playwright results.json and generates a RISK-FOCUSED HTML report.

Philosophy: "Numbers without Story = Noise. Story without Numbers = Still valuable."

This report answers: "What risks threaten the VALUE of our product?"
NOT: "How many tests passed/failed?"

Usage:
  python3 scripts/generate_risk_report.py [results_json] [output_html] [project_name] [environment]
"""

import json, sys, os, re, math, datetime, html as html_mod
from pathlib import Path
from collections import defaultdict

# ─── Args ────────────────────────────────────────────────────────────────────
args = sys.argv[1:]
RESULTS_JSON = args[0] if len(args) > 0 else None
OUTPUT_HTML  = args[1] if len(args) > 1 else None
PROJECT_NAME = args[2] if len(args) > 2 else "EkoAI Console QA"
ENVIRONMENT  = args[3] if len(args) > 3 else "staging"

if not RESULTS_JSON:
    candidates = [
        f"reports/{ENVIRONMENT}/results.json",
        "reports/staging/results.json",
    ]
    for c in candidates:
        if os.path.exists(c):
            RESULTS_JSON = c
            break

if not OUTPUT_HTML:
    base = os.path.dirname(RESULTS_JSON) if RESULTS_JSON else f"reports/{ENVIRONMENT}"
    OUTPUT_HTML = os.path.join(base, "risk-story-report.html")

if not RESULTS_JSON or not os.path.exists(RESULTS_JSON):
    print(f"ERROR: results.json not found at {RESULTS_JSON}")
    sys.exit(1)

# ─── Parse Results ───────────────────────────────────────────────────────────
with open(RESULTS_JSON) as f:
    data = json.load(f)

suites = data.get("suites", [])
config = data.get("config", {})

def extract_tests(suites_list, parent_title=""):
    tests = []
    for suite in suites_list:
        title = suite.get("title", "")
        full_title = f"{parent_title} > {title}" if parent_title else title
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                for result in test.get("results", []):
                    t = {
                        "title": spec.get("title", ""),
                        "suite": full_title,
                        "status": result.get("status", "unknown"),
                        "duration": result.get("duration", 0),
                        "error": "",
                        "retry": result.get("retry", 0),
                        "annotations": spec.get("annotations", []) + test.get("annotations", []),
                        "steps": result.get("steps", []),
                        "attachments": result.get("attachments", []),
                        "file": spec.get("file", ""),
                    }
                    # Extract error
                    if result.get("error", {}).get("message"):
                        t["error"] = result["error"]["message"]
                    elif result.get("errors"):
                        t["error"] = result["errors"][0].get("message", "")

                    # Extract TestRail ID
                    t["testrail_id"] = ""
                    t["tags"] = []
                    t["priority"] = "P2"
                    t["issue_note"] = ""
                    for ann in t["annotations"]:
                        if ann.get("type") == "TestRail":
                            t["testrail_id"] = ann.get("description", "")
                        if ann.get("type") == "issue":
                            t["issue_note"] = ann.get("description", "")
                        if ann.get("type") == "note":
                            pass  # skip notes

                    # Extract tags from title/annotations
                    for ann in t["annotations"]:
                        desc = ann.get("description", "")
                        if desc.startswith("@"):
                            t["tags"].append(desc)

                    # Priority from tags
                    if "@P1" in str(t["tags"]) or "@P1" in t["title"]:
                        t["priority"] = "P1"

                    # Module extraction
                    module = "Unknown"
                    suite_clean = full_title.replace("Morning Brief — ", "").replace("Morning Brief —", "")
                    parts = suite_clean.split(" > ")
                    for p in reversed(parts):
                        p = p.strip()
                        if p and p not in ("", "e2e", "tests", "agentic", "morning-brief"):
                            module = p
                            break
                    t["module"] = module

                    tests.append(t)
        # Recurse
        tests.extend(extract_tests(suite.get("suites", []), full_title))
    return tests

all_tests = extract_tests(suites)

# Deduplicate: keep last result per test title (retries)
seen = {}
for t in all_tests:
    key = t["testrail_id"] or t["title"]
    if key not in seen or t["retry"] > seen[key]["retry"]:
        seen[key] = t
tests = list(seen.values())

# ─── Stats ───────────────────────────────────────────────────────────────────
total = len(tests)
passed = [t for t in tests if t["status"] == "passed"]
failed = [t for t in tests if t["status"] == "failed"]
flaky = [t for t in tests if t["status"] == "passed" and t["retry"] > 0]
skipped = [t for t in tests if t["status"] == "skipped"]
active = total - len(skipped)
pass_rate = (len(passed) / active * 100) if active > 0 else 0

# ─── Risk Analysis ───────────────────────────────────────────────────────────
# Classify each failure into a risk category
RISK_CATEGORIES = {
    "DATA_INTEGRITY": {
        "icon": "🔒",
        "label": "Data Integrity Risk",
        "color": "#dc2626",
        "keywords": ["save", "persist", "update", "delete", "create", "duplicate", "validation", "empty", "required"],
    },
    "USER_EXPERIENCE": {
        "icon": "😤",
        "label": "User Experience Risk",
        "color": "#ea580c",
        "keywords": ["display", "show", "visible", "hidden", "render", "widget", "UI", "modal", "button", "click", "timeout"],
    },
    "BUSINESS_LOGIC": {
        "icon": "⚙️",
        "label": "Business Logic Risk",
        "color": "#9333ea",
        "keywords": ["recurrence", "schedule", "interval", "occurrences", "custom", "repeat", "RRULE", "trigger", "process", "callback"],
    },
    "SECURITY_ACCESS": {
        "icon": "🛡️",
        "label": "Security & Access Risk",
        "color": "#0369a1",
        "keywords": ["auth", "permission", "401", "403", "token", "API key", "security"],
    },
    "INFRA_STABILITY": {
        "icon": "🏗️",
        "label": "Infrastructure Stability Risk",
        "color": "#64748b",
        "keywords": ["timeout", "ERR_", "network", "500", "502", "503", "connection", "ECONNREFUSED"],
    },
}

def classify_risk(test):
    """Classify a failed test into the most relevant risk category."""
    text = f"{test['title']} {test['error']} {test['module']}".lower()
    scores = {}
    for cat, info in RISK_CATEGORIES.items():
        score = sum(1 for kw in info["keywords"] if kw.lower() in text)
        if score > 0:
            scores[cat] = score
    if scores:
        return max(scores, key=scores.get)
    return "USER_EXPERIENCE"  # default

def analyze_business_impact(test):
    """Generate a human-readable business impact statement."""
    title = test["title"].lower()
    error = test["error"]
    module = test["module"]

    # Pattern matching for common scenarios
    if "validation" in title or "empty" in title or "required" in title:
        return {
            "what_promised": f"The {module} form should prevent invalid data submission",
            "what_found": f"Validation may not catch all edge cases — users could submit incomplete or incorrect data",
            "who_affected": "End users filling out forms + data integrity of scheduled jobs",
            "potential_impact": "Invalid configurations could lead to failed job executions or unexpected behavior at runtime",
        }
    elif "delete" in title or "remove" in title:
        return {
            "what_promised": f"Users should be able to safely delete/remove items in {module}",
            "what_found": f"Delete flow has issues — confirmation or cleanup may not work as expected",
            "who_affected": "Admins managing scheduled jobs",
            "potential_impact": "Orphaned data or accidental deletions without proper confirmation",
        }
    elif "custom recurrence" in title or "recurrence" in title:
        return {
            "what_promised": "Custom scheduling (daily/weekly/monthly/yearly) should work reliably",
            "what_found": f"Custom recurrence configuration has a defect: {error[:120]}..." if len(error) > 120 else f"Custom recurrence issue: {error}",
            "who_affected": "All users creating recurring scheduled jobs",
            "potential_impact": "Jobs may run at wrong times, wrong days, or not at all — directly impacts Morning Brief delivery",
        }
    elif "audience" in title or "recipient" in title or "group" in title:
        return {
            "what_promised": "Audience/recipient management should correctly target users and groups",
            "what_found": f"Issue found in {module}: audience selection or display has a problem",
            "who_affected": "All Morning Brief recipients — potentially missing users from delivery",
            "potential_impact": "Users may not receive their Morning Brief, or wrong users may be targeted",
        }
    elif "schedule" in title or "time" in title:
        return {
            "what_promised": "Schedule configuration should correctly set execution timing",
            "what_found": f"Scheduling issue detected in {module}",
            "who_affected": "Operations team managing job schedules",
            "potential_impact": "Jobs may execute at wrong times, causing delayed or missed deliveries",
        }
    elif "widget" in title or "render" in title:
        return {
            "what_promised": "Morning Brief widgets should render correctly for all users",
            "what_found": f"Widget rendering issue: {error[:100]}" if error else "Widget display problem detected",
            "who_affected": "End users viewing Morning Brief content",
            "potential_impact": "Broken or missing content in Morning Brief — degraded user experience",
        }
    elif "timeout" in title or "large" in title or "500" in title:
        return {
            "what_promised": f"{module} should handle load within acceptable response times",
            "what_found": "Performance issue detected — system struggling under load or with large datasets",
            "who_affected": "Users with large teams or high-volume configurations",
            "potential_impact": "Slow page loads, timeouts, or service degradation during peak usage",
        }
    else:
        return {
            "what_promised": f"{module} feature should work as designed",
            "what_found": f"Test failure detected: {error[:120]}" if error else "Unexpected behavior found",
            "who_affected": "Users of the affected feature",
            "potential_impact": "Feature may not work correctly — needs investigation before release",
        }

# Build risk stories
risk_stories = []
for t in failed + [ft for ft in flaky if ft not in failed]:
    category = classify_risk(t)
    impact = analyze_business_impact(t)
    risk_stories.append({
        "test": t,
        "category": category,
        "category_info": RISK_CATEGORIES[category],
        "impact": impact,
        "is_flaky": t in flaky and t["status"] == "passed",
    })

# Group by category
risk_groups = defaultdict(list)
for story in risk_stories:
    risk_groups[story["category"]].append(story)

# ─── Healthy modules (all passed) ───────────────────────────────────────────
module_stats = defaultdict(lambda: {"total": 0, "passed": 0, "failed": 0, "flaky": 0})
for t in tests:
    if t["status"] == "skipped":
        continue
    m = t["module"]
    module_stats[m]["total"] += 1
    if t["status"] == "passed":
        module_stats[m]["passed"] += 1
        if t["retry"] > 0:
            module_stats[m]["flaky"] += 1
    elif t["status"] == "failed":
        module_stats[m]["failed"] += 1

healthy_modules = [m for m, s in module_stats.items() if s["failed"] == 0 and s["flaky"] == 0]
at_risk_modules = [m for m, s in module_stats.items() if s["failed"] > 0 or s["flaky"] > 0]

# ─── Verdict ─────────────────────────────────────────────────────────────────
p1_failures = [t for t in failed if t["priority"] == "P1"]
has_known_bugs = any(s["test"].get("issue_note") for s in risk_stories)

if pass_rate >= 95 and len(p1_failures) == 0:
    verdict = "GO"
    verdict_icon = "✅"
    verdict_text = "Low Risk — Ready for Release"
    verdict_color = "#16a34a"
    verdict_detail = "All critical paths verified. Minor issues documented but do not block release."
elif pass_rate >= 80 and len(p1_failures) == 0:
    verdict = "CONDITIONAL"
    verdict_icon = "⚠️"
    verdict_text = "Medium Risk — Conditional Release"
    verdict_color = "#f59e0b"
    verdict_detail = "Some areas need attention. Review the risk stories below before making a release decision."
else:
    verdict = "NO-GO"
    verdict_icon = "🛑"
    verdict_text = "High Risk — Not Recommended for Release"
    verdict_color = "#dc2626"
    verdict_detail = f"Found {len(p1_failures)} P1 failure(s) and pass rate is {pass_rate:.0f}%. Address critical issues first."

# ─── Generate HTML ───────────────────────────────────────────────────────────
now = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p")
duration_sec = sum(t["duration"] for t in tests) / 1000
duration_str = f"{int(duration_sec // 60)}m {int(duration_sec % 60)}s"

def esc(text):
    return html_mod.escape(str(text)) if text else ""

# Build risk story cards HTML
risk_cards_html = ""
concern_num = 0

for category, stories in sorted(risk_groups.items(), key=lambda x: -len(x[1])):
    info = RISK_CATEGORIES[category]
    for story in stories:
        concern_num += 1
        t = story["test"]
        impact = story["impact"]
        is_flaky = story["is_flaky"]

        status_badge = '<span class="badge badge-flaky">FLAKY</span>' if is_flaky else '<span class="badge badge-failed">FAILED</span>'
        known_bug = f'<span class="badge badge-bug">KNOWN BUG</span>' if t.get("issue_note") else ""

        error_block = ""
        if t["error"]:
            # Clean ANSI codes
            clean_error = re.sub(r'\[[\d;]*m', '', t["error"])
            error_block = f'''
            <div class="error-block">
              <div class="error-label">Error Detail</div>
              <pre>{esc(clean_error[:500])}</pre>
            </div>'''

        risk_cards_html += f'''
        <div class="risk-card" style="border-left: 4px solid {info['color']}">
          <div class="risk-header">
            <div class="risk-number">{info['icon']} Concern #{concern_num}</div>
            <div class="risk-badges">
              {status_badge}
              {known_bug}
              <span class="badge badge-module">{esc(t['module'])}</span>
              <span class="badge badge-priority">{esc(t['priority'])}</span>
              {f'<span class="badge badge-tr">{esc(t["testrail_id"])}</span>' if t["testrail_id"] else ''}
            </div>
          </div>

          <h3 class="risk-title">{esc(t['title'][:120])}</h3>

          <div class="impact-grid">
            <div class="impact-item">
              <div class="impact-label">🎯 What the product promises</div>
              <div class="impact-text">{esc(impact['what_promised'])}</div>
            </div>
            <div class="impact-item">
              <div class="impact-label">🔍 What testing revealed</div>
              <div class="impact-text">{esc(impact['what_found'])}</div>
            </div>
            <div class="impact-item">
              <div class="impact-label">👥 Who is affected</div>
              <div class="impact-text">{esc(impact['who_affected'])}</div>
            </div>
            <div class="impact-item impact-highlight">
              <div class="impact-label">💥 Potential business impact</div>
              <div class="impact-text">{esc(impact['potential_impact'])}</div>
            </div>
          </div>

          {error_block}
        </div>
        '''

# Healthy modules HTML
healthy_html = ""
for m in sorted(healthy_modules):
    s = module_stats[m]
    healthy_html += f'<div class="healthy-chip">{esc(m)} <span class="healthy-count">{s["passed"]}/{s["total"]}</span></div>'

# At risk modules summary
at_risk_summary = ""
for m in sorted(at_risk_modules):
    s = module_stats[m]
    at_risk_summary += f'<div class="at-risk-chip">{esc(m)} <span>({s["failed"]} failed, {s["flaky"]} flaky / {s["total"]})</span></div>'

html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Risk Story Report — {esc(PROJECT_NAME)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: 'Inter', 'Noto Sans Thai', system-ui, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    line-height: 1.6;
    min-height: 100vh;
  }}

  /* ── Header ── */
  .header {{
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1a1a2e 100%);
    border-bottom: 1px solid #334155;
    padding: 40px 60px;
  }}
  .header-top {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }}
  .header h1 {{
    font-size: 28px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 4px;
  }}
  .header .subtitle {{
    font-size: 15px;
    color: #94a3b8;
    margin-bottom: 16px;
  }}
  .header .meta {{
    display: flex;
    gap: 24px;
    font-size: 13px;
    color: #64748b;
  }}
  .env-badge {{
    background: {'#16a34a' if ENVIRONMENT == 'prod' else '#f59e0b' if ENVIRONMENT == 'staging' else '#3b82f6'};
    color: #fff;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}

  /* ── Verdict Banner ── */
  .verdict-banner {{
    background: linear-gradient(135deg, {verdict_color}15, {verdict_color}08);
    border: 1px solid {verdict_color}40;
    border-radius: 16px;
    padding: 32px 40px;
    margin: 32px 60px;
    display: flex;
    align-items: center;
    gap: 24px;
  }}
  .verdict-icon {{
    font-size: 48px;
    flex-shrink: 0;
  }}
  .verdict-content h2 {{
    font-size: 22px;
    color: {verdict_color};
    font-weight: 700;
    margin-bottom: 4px;
  }}
  .verdict-content p {{
    color: #94a3b8;
    font-size: 14px;
  }}
  .verdict-stats {{
    margin-left: auto;
    display: flex;
    gap: 32px;
    flex-shrink: 0;
  }}
  .verdict-stat {{
    text-align: center;
  }}
  .verdict-stat .num {{
    font-size: 28px;
    font-weight: 700;
    color: #f8fafc;
  }}
  .verdict-stat .label {{
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}

  /* ── Content ── */
  .content {{
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 60px 60px;
  }}

  /* ── Section Titles ── */
  .section-title {{
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 40px 0 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }}
  .section-title .count {{
    background: #334155;
    color: #94a3b8;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
  }}

  /* ── TL;DR Summary ── */
  .tldr {{
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px 32px;
    margin-bottom: 32px;
    font-size: 15px;
    color: #cbd5e1;
    line-height: 1.8;
  }}
  .tldr strong {{
    color: #f8fafc;
  }}
  .tldr .highlight {{
    color: #f59e0b;
    font-weight: 600;
  }}

  /* ── Risk Cards ── */
  .risk-card {{
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px 28px;
    margin-bottom: 20px;
    transition: transform 0.15s, box-shadow 0.15s;
  }}
  .risk-card:hover {{
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0,0,0,0.3);
  }}
  .risk-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }}
  .risk-number {{
    font-size: 14px;
    font-weight: 600;
    color: #94a3b8;
  }}
  .risk-badges {{
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }}
  .risk-title {{
    font-size: 16px;
    font-weight: 600;
    color: #f1f5f9;
    margin-bottom: 16px;
    line-height: 1.4;
  }}

  /* ── Badges ── */
  .badge {{
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }}
  .badge-failed {{ background: #dc262620; color: #fca5a5; border: 1px solid #dc262640; }}
  .badge-flaky {{ background: #f59e0b20; color: #fcd34d; border: 1px solid #f59e0b40; }}
  .badge-bug {{ background: #9333ea20; color: #c4b5fd; border: 1px solid #9333ea40; }}
  .badge-module {{ background: #0e7c6120; color: #6ee7b7; border: 1px solid #0e7c6140; }}
  .badge-priority {{ background: #f4735620; color: #fdba74; border: 1px solid #f4735640; }}
  .badge-tr {{ background: #334155; color: #94a3b8; }}

  /* ── Impact Grid ── */
  .impact-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }}
  .impact-item {{
    background: #0f172a;
    border-radius: 8px;
    padding: 14px 16px;
  }}
  .impact-highlight {{
    grid-column: 1 / -1;
    background: linear-gradient(135deg, #dc262608, #f59e0b08);
    border: 1px solid #f59e0b20;
  }}
  .impact-label {{
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }}
  .impact-text {{
    font-size: 14px;
    color: #e2e8f0;
  }}

  /* ── Error Block ── */
  .error-block {{
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 12px;
  }}
  .error-label {{
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    margin-bottom: 6px;
    text-transform: uppercase;
  }}
  .error-block pre {{
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #fca5a5;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
  }}

  /* ── Healthy Modules ── */
  .healthy-grid {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 24px;
  }}
  .healthy-chip {{
    background: #16a34a15;
    border: 1px solid #16a34a30;
    color: #86efac;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
  }}
  .healthy-count {{
    color: #64748b;
    font-size: 11px;
    margin-left: 4px;
  }}
  .at-risk-chip {{
    background: #dc262610;
    border: 1px solid #dc262630;
    color: #fca5a5;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
  }}
  .at-risk-chip span {{
    color: #94a3b8;
    font-size: 11px;
  }}

  /* ── Meeting Prep ── */
  .meeting-card {{
    background: linear-gradient(135deg, #1e293b, #1a1a2e);
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 28px 32px;
    margin-top: 32px;
  }}
  .meeting-card h3 {{
    font-size: 18px;
    color: #f8fafc;
    margin-bottom: 16px;
  }}
  .meeting-script {{
    background: #0f172a;
    border-radius: 8px;
    padding: 20px 24px;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.8;
    border-left: 3px solid #0e7c61;
  }}
  .meeting-script .speaker {{
    color: #6ee7b7;
    font-weight: 600;
  }}

  /* ── Footer ── */
  .footer {{
    text-align: center;
    padding: 32px;
    color: #475569;
    font-size: 12px;
    border-top: 1px solid #1e293b;
    margin-top: 40px;
  }}

  @media (max-width: 768px) {{
    .header, .content {{ padding-left: 20px; padding-right: 20px; }}
    .verdict-banner {{ margin: 20px; padding: 20px; flex-direction: column; }}
    .impact-grid {{ grid-template-columns: 1fr; }}
    .verdict-stats {{ margin-left: 0; }}
  }}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-top">
    <div>
      <h1>📋 Risk Story Report</h1>
      <div class="subtitle">{esc(PROJECT_NAME)} — What risks threaten the value of our product?</div>
      <div class="meta">
        <span>📅 {now}</span>
        <span>⏱ Duration: {duration_str}</span>
        <span>🧪 {total} tests ({len(passed)} passed, {len(failed)} failed, {len(flaky)} flaky)</span>
      </div>
    </div>
    <div class="env-badge">{ENVIRONMENT} Environment</div>
  </div>
</div>

<!-- Verdict -->
<div class="verdict-banner">
  <div class="verdict-icon">{verdict_icon}</div>
  <div class="verdict-content">
    <h2>{verdict_text}</h2>
    <p>{verdict_detail}</p>
  </div>
  <div class="verdict-stats">
    <div class="verdict-stat">
      <div class="num">{pass_rate:.0f}%</div>
      <div class="label">Pass Rate</div>
    </div>
    <div class="verdict-stat">
      <div class="num" style="color: {'#fca5a5' if len(failed) > 0 else '#86efac'}">{len(failed)}</div>
      <div class="label">Failed</div>
    </div>
    <div class="verdict-stat">
      <div class="num">{concern_num}</div>
      <div class="label">Concerns</div>
    </div>
  </div>
</div>

<div class="content">

  <!-- TL;DR -->
  <div class="tldr">
    {"<strong>No critical risks found.</strong> All key areas are stable." if concern_num == 0 else
     f"We have <span class='highlight'>{concern_num} area{'s' if concern_num > 1 else ''} of concern</span> for this release. "
     f"{'<strong>' + str(len(p1_failures)) + ' P1 issue(s)</strong> require immediate attention. ' if p1_failures else ''}"
     f"The detailed risk stories are below — <strong>share these with the team, not just the numbers.</strong>"}
  </div>

  <!-- Areas of Concern -->
  {'<div class="section-title">🚨 Key Areas of Concern <span class="count">' + str(concern_num) + '</span></div>' if concern_num > 0 else ''}

  {risk_cards_html}

  <!-- Healthy Modules -->
  <div class="section-title">✅ Verified & Stable Modules <span class="count">{len(healthy_modules)}</span></div>
  <div class="healthy-grid">
    {healthy_html if healthy_html else '<div style="color:#64748b">No fully healthy modules</div>'}
  </div>

  {'<div class="section-title">⚠️ Modules with Issues <span class="count">' + str(len(at_risk_modules)) + '</span></div><div class="healthy-grid">' + at_risk_summary + '</div>' if at_risk_modules else ''}

  <!-- Meeting Prep Script -->
  <div class="meeting-card">
    <h3>🎤 Meeting Script — Copy & Present</h3>
    <div class="meeting-script">
      <span class="speaker">QA Engineer:</span><br><br>
      {"We verified <strong>" + str(active) + " test scenarios</strong> across " + str(len(module_stats)) + " modules for this release.<br><br>" +
       ("<strong>Good news:</strong> " + str(len(healthy_modules)) + " modules are fully stable with 100% pass rate: " + ", ".join(healthy_modules[:5]) + ("..." if len(healthy_modules) > 5 else "") + ".<br><br>" if healthy_modules else "") +
       (f"However, we have <strong>{concern_num} area{'s' if concern_num > 1 else ''} of concern</strong>:<br><br>" if concern_num > 0 else "<strong>No critical risks found — all modules stable.</strong><br><br>") +
       "".join(
           f"<strong>{i+1}.</strong> {story['category_info']['icon']} {esc(story['impact']['what_found'][:100])}<br>"
           f"&nbsp;&nbsp;&nbsp;👉 Impact: {esc(story['impact']['potential_impact'][:100])}<br><br>"
           for i, story in enumerate(risk_stories[:5])
       ) +
       (f"<br>My recommendation: <strong>{verdict_text}</strong>" if verdict else "")}
    </div>
  </div>

</div>

<div class="footer">
  Generated by Claude QA Agent — Risk Story Report v1.0<br>
  "You can have <em>Story</em> without numbers, but never have numbers without <em>Story</em>" 🧠
</div>

</body>
</html>'''

# ─── Write ───────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUTPUT_HTML) or ".", exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_content)

print("=" * 60)
print(f"✅ Risk Story Report generated: {OUTPUT_HTML}")
print("=" * 60)
print(f"  Verdict:  {verdict_icon} {verdict_text}")
print(f"  Concerns: {concern_num}")
print(f"  Pass Rate: {pass_rate:.0f}%")
for i, story in enumerate(risk_stories[:5]):
    print(f"  #{i+1} {story['category_info']['icon']} {story['test']['title'][:60]}")
print("=" * 60)
