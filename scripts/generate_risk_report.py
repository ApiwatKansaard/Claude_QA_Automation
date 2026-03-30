#!/usr/bin/env python3
"""
Risk Story Report v2.0
=======================
Reads Playwright results.json → generates a RISK-FOCUSED stakeholder report.

Philosophy: "You can have Story without numbers, but never numbers without Story."

Key sections:
  1. Executive Verdict (3 sentences — GO / CONDITIONAL / NO-GO)
  2. Risk Heat Map (Likelihood × Impact matrix)
  3. Key Areas of Concern (risk story cards with business impact)
  4. Release Readiness Scorecard (exit criteria met/unmet)
  5. Module Health Overview (stable vs at-risk)
  6. Meeting Script (copy-paste for standup)
  7. Technical Appendix (error details, collapsible)

Sources / best practices applied:
  - Risk heat map: https://www.metricstream.com/learn/risk-heat-map.html
  - Agile test summary: https://www.merito.com/resources/blogs/test-summary-reports-in-agile-enterprise-qa-reporting-for-risk-based-release-decisions
  - Risk reporting for boards: https://www.v-comply.com/blog/risk-management-report/
  - QA reports that drive business: https://primeqasolutions.com/qa-testing-reports/

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
    for c in [f"reports/{ENVIRONMENT}/results.json", "reports/staging/results.json"]:
        if os.path.exists(c):
            RESULTS_JSON = c
            break

if not OUTPUT_HTML:
    base = os.path.dirname(RESULTS_JSON) if RESULTS_JSON else f"reports/{ENVIRONMENT}"
    OUTPUT_HTML = os.path.join(base, "risk-story-report.html")

if not RESULTS_JSON or not os.path.exists(RESULTS_JSON):
    print(f"ERROR: results.json not found"); sys.exit(1)

# ─── Parse ───────────────────────────────────────────────────────────────────
with open(RESULTS_JSON) as f:
    data = json.load(f)

def extract_tests(suites, parent=""):
    tests = []
    for s in suites:
        title = f"{parent} > {s.get('title','')}" if parent else s.get("title","")
        for spec in s.get("specs", []):
            for test in spec.get("tests", []):
                for result in test.get("results", []):
                    t = {
                        "title": spec.get("title",""), "suite": title,
                        "status": result.get("status","unknown"),
                        "duration": result.get("duration",0),
                        "retry": result.get("retry",0),
                        "error": "",
                        "annotations": spec.get("annotations",[]) + test.get("annotations",[]),
                        "file": spec.get("file",""),
                    }
                    err = result.get("error",{})
                    t["error"] = err.get("message","") if isinstance(err,dict) else str(err)
                    if not t["error"] and result.get("errors"):
                        t["error"] = result["errors"][0].get("message","")

                    t["testrail_id"] = ""
                    t["issue_note"] = ""
                    t["priority"] = "P2"
                    t["tags"] = []
                    for ann in t["annotations"]:
                        if ann.get("type") == "TestRail": t["testrail_id"] = ann.get("description","")
                        if ann.get("type") == "issue": t["issue_note"] = ann.get("description","")

                    if "@P1" in str(t.get("tags","")) or "@P1" in t["title"]: t["priority"] = "P1"
                    for ann in t["annotations"]:
                        d = ann.get("description","")
                        if d.startswith("@"): t["tags"].append(d)

                    # Module
                    module = "Unknown"
                    parts = title.replace("Morning Brief — ","").replace("Morning Brief —","").split(" > ")
                    for p in reversed(parts):
                        p = p.strip()
                        if p and p not in ("","e2e","tests","agentic","morning-brief"):
                            module = p; break
                    t["module"] = module
                    tests.append(t)
        tests.extend(extract_tests(s.get("suites",[]), title))
    return tests

all_tests = extract_tests(data.get("suites",[]))
seen = {}
for t in all_tests:
    key = t["testrail_id"] or t["title"]
    if key not in seen or t["retry"] > seen[key]["retry"]: seen[key] = t
tests = list(seen.values())

total = len(tests)
passed = [t for t in tests if t["status"]=="passed"]
failed = [t for t in tests if t["status"]=="failed"]
flaky  = [t for t in tests if t["status"]=="passed" and t["retry"]>0]
skipped= [t for t in tests if t["status"]=="skipped"]
active = total - len(skipped)
pass_rate = (len(passed)/active*100) if active>0 else 0

# ─── Risk Scoring ────────────────────────────────────────────────────────────
# Likelihood: how reproducible is this? (1=rare, 2=possible, 3=likely)
# Impact: business damage (1=low, 2=medium, 3=high)
# Score = Likelihood × Impact

RISK_CATS = {
    "DATA_INTEGRITY":  {"icon":"🔒","label":"Data Integrity","color":"#dc2626","owner":"Backend Team",
        "kw":["save","persist","update","delete","create","duplicate","validation","empty","required","database"]},
    "USER_EXPERIENCE": {"icon":"😤","label":"User Experience","color":"#ea580c","owner":"Frontend Team",
        "kw":["display","show","visible","hidden","render","widget","UI","modal","button","click","layout"]},
    "BUSINESS_LOGIC":  {"icon":"⚙️","label":"Business Logic","color":"#9333ea","owner":"Backend Team",
        "kw":["recurrence","schedule","interval","occurrences","custom","repeat","RRULE","trigger","process","callback","cron"]},
    "SECURITY":        {"icon":"🛡️","label":"Security & Access","color":"#0369a1","owner":"Security Team",
        "kw":["auth","permission","401","403","token","API key","security","unauthorized"]},
    "PERFORMANCE":     {"icon":"🏗️","label":"Performance & Infra","color":"#64748b","owner":"DevOps / SRE",
        "kw":["timeout","ERR_","network","500","502","503","connection","slow","large","load","memory"]},
    "DELIVERY":        {"icon":"📬","label":"Content Delivery","color":"#0891b2","owner":"Product Team",
        "kw":["audience","recipient","group","delivery","home page","notification","push","email","member"]},
}

def classify_risk(t):
    text = f"{t['title']} {t['error']} {t['module']}".lower()
    scores = {cat: sum(1 for kw in info["kw"] if kw.lower() in text) for cat, info in RISK_CATS.items()}
    return max(scores, key=scores.get) if any(v>0 for v in scores.values()) else "USER_EXPERIENCE"

def score_likelihood(t):
    if t["status"]=="failed" and t["retry"]==0: return 3  # always fails
    if t["retry"]>0: return 2  # intermittent
    return 1

def score_impact(t):
    text = f"{t['title']} {t['error']}".lower()
    if any(kw in text for kw in ["data loss","delete","payment","security","auth","500"]): return 3
    if any(kw in text for kw in ["save","create","schedule","delivery","audience","recipient"]): return 3
    if any(kw in text for kw in ["validation","display","render","timeout","large"]): return 2
    return 1

def business_story(t, cat):
    title_l = t["title"].lower()
    module = t["module"]
    if "validation" in title_l or "empty" in title_l or "required" in title_l:
        return ("Users can submit forms with missing or invalid data",
                f"The {module} form may accept incomplete input — this could create broken scheduled jobs that fail silently at runtime.",
                "Create server-side validation as fallback; add integration test for boundary values")
    elif "delete" in title_l or "remove" in title_l:
        return ("Deleting items may not clean up properly",
                f"Users deleting jobs in {module} may see orphaned records or get unexpected errors. Data cleanup at scale could be affected.",
                "Verify cascade delete in DB; add cleanup job for orphaned records")
    elif "recurrence" in title_l or "schedule" in title_l or "repeat" in title_l:
        return ("Scheduled job timing could be wrong",
                "Custom recurrence settings may produce incorrect execution times. Jobs could run at wrong intervals, wrong days, or not at all — directly impacting Morning Brief delivery to all users.",
                "Verify RRULE generation matches expected cron; add monitoring alert for missed executions")
    elif "audience" in title_l or "recipient" in title_l or "group" in title_l:
        return ("Some users may not receive their Morning Brief",
                f"Audience/recipient configuration in {module} has issues. Users could be missing from delivery lists, or wrong users could be targeted.",
                "Cross-check audience resolution against directory service; add delivery receipt tracking")
    elif "widget" in title_l or "render" in title_l or "content" in title_l:
        return ("Morning Brief content may display incorrectly",
                "Widget rendering has issues — users may see broken layouts, missing data, or error states instead of their personalized brief.",
                "Add fallback rendering for corrupted widgets; implement content validation pre-delivery")
    elif "timeout" in title_l or "large" in title_l or "500" in title_l or "performance" in title_l:
        return ("System struggles under load or large data",
                f"Performance issue in {module}: the system may slow down or fail for users with large teams or high-volume configurations. Peak-hour usage could be affected.",
                "Profile query performance; add pagination; set up APM alerts for p95 latency")
    elif "toggle" in title_l or "status" in title_l or "active" in title_l:
        return ("Job activation toggle may be unreliable",
                f"Toggling job status in {module} shows inconsistent behavior. Admins may think a job is active when it isn't, or vice versa.",
                "Add optimistic UI update with server confirmation; retry on failure")
    else:
        return (f"{module} feature has unexpected behavior",
                f"Testing revealed an issue in {module} that could affect users. The feature may not work as designed under certain conditions.",
                "Investigate root cause; add regression test; consider feature flag for rollback")

# Build risk items
risks = []
for t in failed + [f for f in flaky if f not in failed]:
    cat = classify_risk(t)
    L = score_likelihood(t)
    I = score_impact(t)
    headline, narrative, mitigation = business_story(t, cat)
    risks.append({
        "test": t, "category": cat, "info": RISK_CATS[cat],
        "likelihood": L, "impact": I, "score": L*I,
        "headline": headline, "narrative": narrative, "mitigation": mitigation,
        "is_flaky": t in flaky,
    })

risks.sort(key=lambda r: -r["score"])

# Module stats
mod_stats = defaultdict(lambda: {"total":0,"passed":0,"failed":0,"flaky":0})
for t in tests:
    if t["status"]=="skipped": continue
    m = t["module"]
    mod_stats[m]["total"] += 1
    if t["status"]=="passed":
        mod_stats[m]["passed"] += 1
        if t["retry"]>0: mod_stats[m]["flaky"] += 1
    elif t["status"]=="failed": mod_stats[m]["failed"] += 1

healthy = sorted([m for m,s in mod_stats.items() if s["failed"]==0 and s["flaky"]==0])
at_risk = sorted([m for m,s in mod_stats.items() if s["failed"]>0 or s["flaky"]>0])

# Exit criteria
p1_fails = [t for t in failed if t["priority"]=="P1"]
exit_criteria = [
    ("Pass rate ≥ 95%", pass_rate >= 95),
    ("No P1 failures", len(p1_fails) == 0),
    ("No data integrity risks", not any(r["category"]=="DATA_INTEGRITY" and r["score"]>=6 for r in risks)),
    ("No security risks", not any(r["category"]=="SECURITY" and r["score"]>=4 for r in risks)),
    ("All critical modules stable", all(mod_stats[m]["failed"]==0 for m in ["Create Scheduled Job","Dashboard","Job Configuration"] if m in mod_stats)),
]
exit_met = sum(1 for _,v in exit_criteria if v)
exit_total = len(exit_criteria)

# Verdict
if pass_rate >= 95 and len(p1_fails)==0:
    verdict="GO"; v_icon="✅"; v_text="Low Risk — Ready for Release"; v_color="#16a34a"
    v_detail="All critical paths verified. Minor issues documented and do not block release."
elif pass_rate >= 80 and len(p1_fails)==0:
    verdict="CONDITIONAL"; v_icon="⚠️"; v_text="Medium Risk — Conditional Release"; v_color="#f59e0b"
    v_detail="Some areas need attention. Review the risk stories below before deciding."
else:
    verdict="NO-GO"; v_icon="🛑"; v_text="High Risk — Not Recommended"; v_color="#dc2626"
    v_detail=f"{len(p1_fails)} P1 failure(s). Address critical issues before release."

# ─── Heat Map Data ───────────────────────────────────────────────────────────
# 3×3 matrix: rows=Impact(High/Med/Low), cols=Likelihood(Low/Med/High)
heatmap = [[[] for _ in range(3)] for _ in range(3)]
for r in risks:
    li = min(r["likelihood"]-1, 2)  # 0,1,2
    ii = min(r["impact"]-1, 2)      # 0,1,2
    heatmap[2-ii][li].append(r)  # row 0=high impact, row 2=low impact

def hm_cell_color(row, col):
    # row 0=high impact, col 2=high likelihood
    score = (3-row) * (col+1)  # crude
    if row==0 and col==2: return "#dc2626"  # critical
    if row<=1 and col>=1: return "#ea580c"  # high
    if row==0 or col==2: return "#f59e0b"   # medium
    if row==1 and col==1: return "#f59e0b"  # medium
    return "#16a34a"  # low

# ─── Generate HTML ───────────────────────────────────────────────────────────
now = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p")
dur = sum(t["duration"] for t in tests)/1000
dur_str = f"{int(dur//60)}m {int(dur%60)}s"
esc = lambda t: html_mod.escape(str(t)) if t else ""

# Heat map cells
hm_html = ""
impact_labels = ["HIGH","MEDIUM","LOW"]
likelihood_labels = ["LOW","MEDIUM","HIGH"]
for ri in range(3):
    for ci in range(3):
        items = heatmap[ri][ci]
        bg = hm_cell_color(ri, ci)
        opacity = "30" if not items else "90"
        count = len(items)
        dots = "".join(f'<span class="hm-dot" title="{esc(r["test"]["title"][:50])}">{r["info"]["icon"]}</span>' for r in items[:4])
        extra = f'<span class="hm-extra">+{count-4}</span>' if count>4 else ""
        hm_html += f'<div class="hm-cell" style="background:{bg}{opacity};grid-row:{ri+1};grid-column:{ci+1}">{dots}{extra}{"" if items else "<span class=hm-empty>—</span>"}</div>'

# Risk cards
cards_html = ""
for i, r in enumerate(risks):
    t = r["test"]
    clean_err = re.sub(r'\[[\d;]*m','', t["error"])[:400]
    sev_label = "CRITICAL" if r["score"]>=6 else "HIGH" if r["score"]>=4 else "MEDIUM" if r["score"]>=2 else "LOW"
    sev_colors = {"CRITICAL":"#dc2626","HIGH":"#ea580c","MEDIUM":"#f59e0b","LOW":"#16a34a"}
    flaky_badge = '<span class="badge b-flaky">FLAKY</span>' if r["is_flaky"] else '<span class="badge b-fail">FAILED</span>'
    bug_badge = f'<span class="badge b-bug">KNOWN BUG</span>' if t.get("issue_note") else ""

    cards_html += f'''
    <div class="risk-card" style="--accent:{r['info']['color']}">
      <div class="rc-top">
        <div class="rc-num">#{i+1}</div>
        <div class="rc-sev" style="background:{sev_colors[sev_label]}">{sev_label}</div>
        <div class="rc-score">Risk Score: {r['score']}/9</div>
        <div class="rc-badges">{flaky_badge}{bug_badge}<span class="badge b-mod">{esc(t['module'])}</span><span class="badge b-pri">{esc(t['priority'])}</span>{f'<span class="badge b-tr">{esc(t["testrail_id"])}</span>' if t["testrail_id"] else ''}</div>
      </div>

      <div class="rc-headline">{r['info']['icon']} {esc(r['headline'])}</div>

      <div class="rc-narrative">{esc(r['narrative'])}</div>

      <div class="rc-grid">
        <div class="rc-item">
          <div class="rc-label">LIKELIHOOD</div>
          <div class="rc-meter"><div class="rc-bar" style="width:{r['likelihood']*33}%;background:{r['info']['color']}">{['','Rare','Possible','Likely'][r['likelihood']]}</div></div>
        </div>
        <div class="rc-item">
          <div class="rc-label">IMPACT</div>
          <div class="rc-meter"><div class="rc-bar" style="width:{r['impact']*33}%;background:{r['info']['color']}">{['','Low','Medium','High'][r['impact']]}</div></div>
        </div>
        <div class="rc-item">
          <div class="rc-label">CATEGORY</div>
          <div class="rc-val">{r['info']['icon']} {r['info']['label']}</div>
        </div>
        <div class="rc-item">
          <div class="rc-label">OWNER</div>
          <div class="rc-val">👤 {r['info']['owner']}</div>
        </div>
      </div>

      <div class="rc-mitigation">
        <div class="rc-label">💡 RECOMMENDED ACTION</div>
        <div class="rc-val">{esc(r['mitigation'])}</div>
      </div>

      <details class="rc-details">
        <summary>View technical error</summary>
        <pre>{esc(clean_err)}</pre>
      </details>
    </div>'''

# Exit criteria
ec_html = ""
for label, met in exit_criteria:
    icon = "✅" if met else "❌"
    cls = "ec-pass" if met else "ec-fail"
    ec_html += f'<div class="ec-row {cls}"><span class="ec-icon">{icon}</span><span>{esc(label)}</span></div>'

# Healthy chips
h_chips = "".join(f'<div class="chip chip-ok">✅ {esc(m)} <span>{mod_stats[m]["passed"]}/{mod_stats[m]["total"]}</span></div>' for m in healthy)
r_chips = "".join(f'<div class="chip chip-risk">⚠️ {esc(m)} <span>{mod_stats[m]["failed"]}F {mod_stats[m]["flaky"]}FL / {mod_stats[m]["total"]}</span></div>' for m in at_risk)

# Meeting script
script_concerns = ""
for i, r in enumerate(risks[:5]):
    script_concerns += f'''<div class="ms-item"><strong>{i+1}️⃣ {esc(r['headline'])}</strong><br>
👉 {esc(r['narrative'][:120])}<br>
👉 Recommended: {esc(r['mitigation'][:100])}</div>'''

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Risk Story Report — {esc(PROJECT_NAME)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Inter','Noto Sans Thai',system-ui;background:#0a0e1a;color:#e2e8f0;line-height:1.6}}

/* Header */
.hdr{{background:linear-gradient(135deg,#0f1629 0%,#1a1040 50%,#0f1629 100%);border-bottom:1px solid #1e293b;padding:48px 64px 40px}}
.hdr-row{{display:flex;justify-content:space-between;align-items:flex-start}}
.hdr h1{{font-size:32px;font-weight:800;background:linear-gradient(135deg,#f8fafc,#94a3b8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}}
.hdr .sub{{color:#64748b;font-size:14px;margin-bottom:20px;font-style:italic}}
.hdr .meta{{display:flex;gap:24px;font-size:12px;color:#475569}}
.env{{background:{'#16a34a' if ENVIRONMENT=='prod' else '#f59e0b'};color:#000;padding:6px 18px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px}}

/* Verdict */
.verdict{{margin:32px 64px;background:linear-gradient(135deg,{v_color}12,{v_color}06);border:1px solid {v_color}35;border-radius:16px;padding:36px 44px;display:flex;align-items:center;gap:28px}}
.v-icon{{font-size:56px}}
.v-body h2{{font-size:24px;font-weight:800;color:{v_color}}}
.v-body p{{color:#94a3b8;font-size:14px;margin-top:2px}}
.v-stats{{margin-left:auto;display:flex;gap:40px}}
.v-stat{{text-align:center}}.v-stat .n{{font-size:32px;font-weight:800;color:#f8fafc}}.v-stat .l{{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:2px}}

/* Content */
.content{{max-width:1240px;margin:0 auto;padding:0 64px 64px}}

/* Section */
.sec{{font-size:18px;font-weight:700;color:#f1f5f9;margin:44px 0 16px;display:flex;align-items:center;gap:10px}}
.sec .cnt{{background:#1e293b;color:#64748b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500}}

/* Executive Summary */
.exec{{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:24px 32px;margin-bottom:28px;font-size:15px;color:#94a3b8;line-height:1.9}}
.exec strong{{color:#f1f5f9}}.exec .hl{{color:#f59e0b;font-weight:600}}

/* Heat Map */
.hm-wrap{{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:28px;margin-bottom:28px}}
.hm-title{{font-size:14px;font-weight:600;color:#94a3b8;margin-bottom:16px;text-align:center}}
.hm-container{{display:grid;grid-template-columns:60px repeat(3,1fr);grid-template-rows:repeat(3,80px) 30px;gap:4px;max-width:500px;margin:0 auto}}
.hm-ylabel{{grid-column:1;display:flex;align-items:center;justify-content:flex-end;padding-right:12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}}
.hm-xlabel{{display:flex;align-items:flex-start;justify-content:center;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;padding-top:6px}}
.hm-cell{{border-radius:8px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;padding:6px;transition:transform .15s}}
.hm-cell:hover{{transform:scale(1.05);z-index:1}}
.hm-dot{{font-size:16px;cursor:default}}.hm-extra{{font-size:10px;color:#fff;font-weight:600}}.hm-empty{{color:#ffffff30;font-size:12px}}
.hm-axis{{grid-column:2/5;grid-row:4;text-align:center;font-size:10px;color:#475569;padding-top:4px}}

/* Risk Cards */
.risk-card{{background:#111827;border:1px solid #1e293b;border-left:4px solid var(--accent);border-radius:12px;padding:28px;margin-bottom:16px;transition:transform .15s,box-shadow .15s}}
.risk-card:hover{{transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,0.4)}}
.rc-top{{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}}
.rc-num{{font-size:20px;font-weight:800;color:#475569}}
.rc-sev{{padding:3px 12px;border-radius:10px;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.5px}}
.rc-score{{font-size:11px;color:#64748b;margin-left:4px}}
.rc-badges{{margin-left:auto;display:flex;gap:5px;flex-wrap:wrap}}
.badge{{padding:2px 9px;border-radius:8px;font-size:10px;font-weight:600}}
.b-fail{{background:#dc262618;color:#fca5a5;border:1px solid #dc262635}}
.b-flaky{{background:#f59e0b18;color:#fcd34d;border:1px solid #f59e0b35}}
.b-bug{{background:#9333ea18;color:#c4b5fd;border:1px solid #9333ea35}}
.b-mod{{background:#0e7c6118;color:#6ee7b7;border:1px solid #0e7c6135}}
.b-pri{{background:#f4735618;color:#fdba74;border:1px solid #f4735635}}
.b-tr{{background:#1e293b;color:#64748b}}
.rc-headline{{font-size:17px;font-weight:700;color:#f8fafc;margin-bottom:8px}}
.rc-narrative{{font-size:14px;color:#cbd5e1;margin-bottom:18px;line-height:1.7;padding-left:2px}}
.rc-grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}}
.rc-item{{background:#0a0e1a;border-radius:8px;padding:12px 14px}}
.rc-label{{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}}
.rc-val{{font-size:13px;color:#e2e8f0}}
.rc-meter{{height:22px;background:#1e293b;border-radius:6px;overflow:hidden}}
.rc-bar{{height:100%;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;min-width:50px}}
.rc-mitigation{{background:linear-gradient(135deg,#16a34a08,#0e7c6108);border:1px solid #16a34a20;border-radius:8px;padding:12px 14px;margin-bottom:10px}}
.rc-details{{margin-top:8px}}
.rc-details summary{{font-size:12px;color:#64748b;cursor:pointer;padding:6px 0}}
.rc-details summary:hover{{color:#94a3b8}}
.rc-details pre{{background:#0a0e1a;border:1px solid #1e293b;border-radius:6px;padding:12px;font-size:11px;color:#fca5a5;white-space:pre-wrap;word-break:break-all;margin-top:6px;max-height:200px;overflow-y:auto}}

/* Exit Criteria */
.ec-wrap{{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:24px 28px;margin-bottom:28px}}
.ec-row{{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1e293b;font-size:14px}}
.ec-row:last-child{{border:none}}
.ec-pass{{color:#86efac}}.ec-fail{{color:#fca5a5}}
.ec-icon{{font-size:18px}}
.ec-bar{{margin-top:16px;height:8px;background:#1e293b;border-radius:4px;overflow:hidden}}
.ec-fill{{height:100%;background:linear-gradient(90deg,#16a34a,#0e7c61);border-radius:4px;transition:width .5s}}

/* Chips */
.chips{{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}}
.chip{{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px}}
.chip span{{color:#64748b;font-size:11px}}
.chip-ok{{background:#16a34a12;border:1px solid #16a34a25;color:#86efac}}
.chip-risk{{background:#dc262610;border:1px solid #dc262625;color:#fca5a5}}

/* Meeting Script */
.ms{{background:linear-gradient(135deg,#111827,#0f1629);border:1px solid #1e293b;border-radius:12px;padding:32px;margin-top:28px}}
.ms h3{{font-size:18px;color:#f8fafc;margin-bottom:20px;display:flex;align-items:center;gap:8px}}
.ms-box{{background:#0a0e1a;border-left:3px solid #0e7c61;border-radius:0 8px 8px 0;padding:24px 28px;font-size:14px;color:#cbd5e1;line-height:2}}
.ms-box .speaker{{color:#6ee7b7;font-weight:700;font-size:15px}}
.ms-item{{margin:12px 0;padding:8px 0;border-bottom:1px solid #1e293b}}
.ms-item:last-child{{border:none}}

/* Footer */
.footer{{text-align:center;padding:40px;color:#334155;font-size:11px;border-top:1px solid #111827;margin-top:48px}}
.footer em{{color:#475569}}

@media(max-width:768px){{
  .hdr,.content{{padding-left:20px;padding-right:20px}}
  .verdict{{margin:20px;padding:24px;flex-direction:column}}
  .v-stats{{margin-left:0}}.rc-grid{{grid-template-columns:1fr}}
  .hm-container{{max-width:100%}}
}}
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-row">
    <div>
      <h1>Risk Story Report</h1>
      <div class="sub">{esc(PROJECT_NAME)} — What risks threaten the value of our product?</div>
      <div class="meta">
        <span>📅 {now}</span>
        <span>⏱ {dur_str}</span>
        <span>🧪 {active} tests verified</span>
        <span>📁 {len(mod_stats)} modules</span>
      </div>
    </div>
    <div class="env">{ENVIRONMENT}</div>
  </div>
</div>

<div class="verdict">
  <div class="v-icon">{v_icon}</div>
  <div class="v-body">
    <h2>{v_text}</h2>
    <p>{v_detail}</p>
  </div>
  <div class="v-stats">
    <div class="v-stat"><div class="n">{pass_rate:.0f}%</div><div class="l">Pass Rate</div></div>
    <div class="v-stat"><div class="n" style="color:{'#fca5a5' if failed else '#86efac'}">{len(failed)}</div><div class="l">Failed</div></div>
    <div class="v-stat"><div class="n">{len(risks)}</div><div class="l">Concerns</div></div>
    <div class="v-stat"><div class="n">{exit_met}/{exit_total}</div><div class="l">Exit Criteria</div></div>
  </div>
</div>

<div class="content">

  <div class="exec">
    {"<strong>No critical risks found.</strong> All key areas are stable and verified. The product is ready for release." if not risks else
     f"We identified <span class='hl'>{len(risks)} area{'s' if len(risks)>1 else ''} of concern</span> for this release after verifying {active} test scenarios across {len(mod_stats)} modules. "
     + (f"<strong>{len(p1_fails)} P1 issue(s)</strong> require immediate attention before release. " if p1_fails else "")
     + f"<strong>{len(healthy)}</strong> modules are fully stable. "
     + "<strong>Share the risk stories below — not just the numbers.</strong>"}
  </div>

  {"<div class='sec'>📊 Risk Heat Map</div>" if risks else ""}
  {"<div class='hm-wrap'><div class='hm-title'>LIKELIHOOD → vs ← IMPACT</div><div class='hm-container'>" +
   f"<div class='hm-ylabel' style='grid-row:1'>HIGH</div><div class='hm-ylabel' style='grid-row:2'>MED</div><div class='hm-ylabel' style='grid-row:3'>LOW</div>" +
   hm_html +
   f"<div style='grid-column:1'></div><div class='hm-xlabel'>Low</div><div class='hm-xlabel'>Medium</div><div class='hm-xlabel'>High</div>" +
   "</div><div style='text-align:center;margin-top:12px;font-size:11px;color:#475569'>↑ IMPACT &nbsp;&nbsp;|&nbsp;&nbsp; LIKELIHOOD →</div></div>" if risks else ""}

  <div class="sec">📋 Release Readiness <span class="cnt">{exit_met}/{exit_total} met</span></div>
  <div class="ec-wrap">
    {ec_html}
    <div class="ec-bar"><div class="ec-fill" style="width:{exit_met/exit_total*100 if exit_total else 0}%"></div></div>
  </div>

  {"<div class='sec'>🚨 Key Areas of Concern <span class=cnt>" + str(len(risks)) + "</span></div>" if risks else ""}
  {cards_html}

  <div class="sec">✅ Verified & Stable <span class="cnt">{len(healthy)}</span></div>
  <div class="chips">{h_chips or '<span style="color:#475569">None</span>'}</div>

  {"<div class='sec'>⚠️ Modules with Issues <span class=cnt>" + str(len(at_risk)) + "</span></div><div class='chips'>" + r_chips + "</div>" if at_risk else ""}

  <div class="ms">
    <h3>🎤 Meeting Script — Copy & Present</h3>
    <div class="ms-box">
      <span class="speaker">QA Engineer:</span><br><br>
      We verified <strong>{active} test scenarios</strong> across {len(mod_stats)} modules for the <strong>{esc(PROJECT_NAME)}</strong> release.<br><br>
      {"<strong>Good news:</strong> " + str(len(healthy)) + " modules passed with 100% stability: " + ", ".join(healthy[:6]) + ("..." if len(healthy)>6 else "") + ".<br><br>" if healthy else ""}
      {f"However, we have <strong>{len(risks)} area{'s' if len(risks)>1 else ''} of concern</strong>:<br><br>" if risks else "<strong>No risks found — all modules are stable. ✅</strong><br><br>"}
      {script_concerns}
      {"<br>" if risks else ""}
      <strong>Release Readiness:</strong> {exit_met}/{exit_total} exit criteria met.<br>
      My recommendation: <strong>{v_text}</strong>
    </div>
  </div>

</div>

<div class="footer">
  Generated by Claude QA Agent — Risk Story Report v2.0<br>
  <em>"You can have Story without numbers, but never have numbers without Story"</em> 🧠<br><br>
  Sources: <a href="https://www.merito.com/resources/blogs/test-summary-reports-in-agile-enterprise-qa-reporting-for-risk-based-release-decisions" style="color:#475569">Merito</a> ·
  <a href="https://www.v-comply.com/blog/risk-management-report/" style="color:#475569">V-Comply</a> ·
  <a href="https://www.metricstream.com/learn/risk-heat-map.html" style="color:#475569">MetricStream</a>
</div>

</body></html>'''

os.makedirs(os.path.dirname(OUTPUT_HTML) or ".", exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)

print("="*60)
print(f"✅ Risk Story Report v2.0: {OUTPUT_HTML}")
print("="*60)
print(f"  Verdict:    {v_icon} {v_text}")
print(f"  Concerns:   {len(risks)}")
print(f"  Pass Rate:  {pass_rate:.0f}%")
print(f"  Exit:       {exit_met}/{exit_total} criteria met")
print(f"  Heat Map:   {sum(1 for row in heatmap for cell in row if cell)} occupied cells")
for i,r in enumerate(risks[:5]):
    sev = "CRIT" if r["score"]>=6 else "HIGH" if r["score"]>=4 else "MED"
    print(f"  #{i+1} [{sev}] {r['info']['icon']} {r['headline'][:55]}")
print("="*60)
