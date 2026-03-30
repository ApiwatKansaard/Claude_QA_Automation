#!/usr/bin/env python3
"""
Risk Story Report v4.0 — Amity Edition
========================================
Brand: Amity (#04be8c) · Dark Glassmorphism · Intuitive Risk Map
"""
import json,sys,os,re,datetime,html as H
from collections import defaultdict

args=sys.argv[1:]
RJ=args[0] if len(args)>0 else None
OH=args[1] if len(args)>1 else None
PN=args[2] if len(args)>2 else "EkoAI Console QA"
ENV=args[3] if len(args)>3 else "staging"

if not RJ:
    for c in [f"reports/{ENV}/results.json","reports/staging/results.json"]:
        if os.path.exists(c): RJ=c; break
if not OH: OH=os.path.join(os.path.dirname(RJ) if RJ else f"reports/{ENV}","risk-story-report.html")
if not RJ or not os.path.exists(RJ): print("ERROR: results.json not found"); sys.exit(1)

with open(RJ) as f: data=json.load(f)

# ── Parse ────────────────────────────────────────────────────────────────
def extract(suites,p=""):
    tests=[]
    for s in suites:
        t=f"{p} > {s.get('title','')}" if p else s.get("title","")
        for sp in s.get("specs",[]):
            for test in sp.get("tests",[]):
                for r in test.get("results",[]):
                    d={"title":sp.get("title",""),"suite":t,"status":r.get("status","unknown"),
                       "duration":r.get("duration",0),"retry":r.get("retry",0),"error":"",
                       "annotations":sp.get("annotations",[])+test.get("annotations",[]),"file":sp.get("file","")}
                    err=r.get("error",{})
                    d["error"]=err.get("message","") if isinstance(err,dict) else str(err)
                    if not d["error"] and r.get("errors"): d["error"]=r["errors"][0].get("message","")
                    d["trid"]="";d["issue"]="";d["pri"]="P2"
                    for a in d["annotations"]:
                        if a.get("type")=="TestRail": d["trid"]=a.get("description","")
                        if a.get("type")=="issue": d["issue"]=a.get("description","")
                    if "@P1" in d["title"]: d["pri"]="P1"
                    mod="Unknown"
                    for pt in reversed(t.replace("Morning Brief — ","").replace("Morning Brief —","").split(" > ")):
                        pt=pt.strip()
                        if pt and pt not in ("","e2e","tests","agentic","morning-brief"): mod=pt; break
                    d["module"]=mod; tests.append(d)
        tests.extend(extract(s.get("suites",[]),t))
    return tests

all_t=extract(data.get("suites",[])); seen={}
for t in all_t:
    k=t["trid"] or t["title"]
    if k not in seen or t["retry"]>seen[k]["retry"]: seen[k]=t
tests=list(seen.values())

total=len(tests)
passed=[t for t in tests if t["status"]=="passed"]
failed=[t for t in tests if t["status"]=="failed"]
flaky=[t for t in tests if t["status"]=="passed" and t["retry"]>0]
skipped=[t for t in tests if t["status"]=="skipped"]
active=total-len(skipped); pr=(len(passed)/active*100) if active>0 else 0

# ── Risk Analysis ────────────────────────────────────────────────────────
CATS={"DATA":{"i":"🔒","l":"Data Integrity","c":"#f43f5e","o":"Backend"},
      "UX":{"i":"🖥️","l":"User Experience","c":"#f97316","o":"Frontend"},
      "LOGIC":{"i":"⚙️","l":"Business Logic","c":"#a855f7","o":"Backend"},
      "SECURITY":{"i":"🛡️","l":"Security","c":"#3b82f6","o":"Security"},
      "PERF":{"i":"⚡","l":"Performance","c":"#64748b","o":"DevOps"},
      "DELIVERY":{"i":"📬","l":"Delivery","c":"#06b6d4","o":"Product"}}

KW={"DATA":["save","persist","update","delete","create","duplicate","validation","empty","required"],
    "UX":["display","show","visible","hidden","render","widget","UI","modal","button","layout"],
    "LOGIC":["recurrence","schedule","interval","occurrences","repeat","RRULE","trigger","process","callback"],
    "SECURITY":["auth","permission","401","403","token","API key","security"],
    "PERF":["timeout","ERR_","network","500","502","connection","slow","large","load"],
    "DELIVERY":["audience","recipient","group","delivery","home page","notification","member"]}

def classify(t):
    txt=f"{t['title']} {t['error']} {t['module']}".lower()
    sc={c:sum(1 for kw in kws if kw.lower() in txt) for c,kws in KW.items()}
    return max(sc,key=sc.get) if any(v>0 for v in sc.values()) else "UX"

def lhood(t): return 3 if t["status"]=="failed" and t["retry"]==0 else 2 if t["retry"]>0 else 1
def impact(t):
    txt=f"{t['title']} {t['error']}".lower()
    if any(k in txt for k in ["data loss","delete","payment","security","500"]): return 3
    if any(k in txt for k in ["save","create","schedule","delivery","audience"]): return 3
    if any(k in txt for k in ["validation","display","render","timeout","large"]): return 2
    return 1

def story(t):
    tl=t["title"].lower(); m=t["module"]
    stories={
        ("recurrence","schedule","repeat"):("Scheduled jobs may run at wrong times","Jobs could fire at wrong intervals — affecting all Morning Brief deliveries"),
        ("audience","recipient","group"):("Some users may miss their Morning Brief","Audience targeting issue — users could be excluded from delivery"),
        ("widget","render","content"):("Brief content may display broken","Users may see broken layouts or missing data in their brief"),
        ("validation","empty"):("Invalid data can slip through","Forms may accept incomplete input, creating broken configurations"),
        ("delete","remove"):("Delete flow has issues","Deleting items may leave orphaned data or unexpected errors"),
        ("timeout","large","500"):("System struggles under load",f"{m} may slow down for large teams or high-volume data"),
        ("toggle","status","active"):("Job toggle may be unreliable","Admins may think a job is active when it isn't, or vice versa"),
    }
    for keys,val in stories.items():
        if any(k in tl for k in keys): return val
    return(f"{m} has unexpected behavior","Feature may not work correctly under certain conditions")

risks=[]
for t in failed+[f for f in flaky if f not in failed]:
    cat=classify(t); L=lhood(t); I=impact(t); hl,nr=story(t)
    risks.append({"t":t,"cat":cat,"info":CATS[cat],"L":L,"I":I,"s":L*I,"hl":hl,"nr":nr,"flaky":t in flaky})
risks.sort(key=lambda r:-r["s"])

ms=defaultdict(lambda:{"t":0,"p":0,"f":0,"fl":0})
for t in tests:
    if t["status"]=="skipped": continue
    m=t["module"]; ms[m]["t"]+=1
    if t["status"]=="passed": ms[m]["p"]+=1; ms[m]["fl"]+=(1 if t["retry"]>0 else 0)
    elif t["status"]=="failed": ms[m]["f"]+=1

healthy=sorted([m for m,s in ms.items() if s["f"]==0 and s["fl"]==0])
atrisk=sorted([m for m,s in ms.items() if s["f"]>0 or s["fl"]>0])
p1f=[t for t in failed if t["pri"]=="P1"]

ec=[("Pass rate ≥ 95%",pr>=95),("Zero P1 failures",len(p1f)==0),
    ("No data integrity risks",not any(r["cat"]=="DATA" and r["s"]>=6 for r in risks)),
    ("No security risks",not any(r["cat"]=="SECURITY" and r["s"]>=4 for r in risks)),
    ("Critical modules stable",all(ms[m]["f"]==0 for m in ["Create Scheduled Job","Dashboard","Job Configuration"] if m in ms))]
ecm=sum(1 for _,v in ec if v)

if pr>=95 and len(p1f)==0: vi="✅";vt="Ready for Release";vc="#04be8c";vx="All critical paths verified. Ship it."
elif pr>=80 and len(p1f)==0: vi="⚠️";vt="Conditional Release";vc="#f59e0b";vx="Review concerns below before deciding."
else: vi="🛑";vt="Not Ready";vc="#ef4444";vx=f"{len(p1f)} P1 issue(s) block release."

now=datetime.datetime.now().strftime("%b %d, %Y · %I:%M %p")
dur=sum(t["duration"] for t in tests)/1000; ds=f"{int(dur//60)}m {int(dur%60)}s"
e=lambda t:H.escape(str(t)) if t else ""

# ── Risk Map (simple visual list instead of confusing grid) ──────────────
SLAB={"CRITICAL":{"c":"#ef4444","bg":"#ef444420","label":"Critical — Fix before release"},
      "HIGH":{"c":"#f97316","bg":"#f9731620","label":"High — Plan fix this sprint"},
      "MEDIUM":{"c":"#f59e0b","bg":"#f59e0b15","label":"Medium — Monitor closely"}}

risk_map_html=""
# Group risks by severity
for sev in ["CRITICAL","HIGH","MEDIUM"]:
    items=[r for r in risks if (r["s"]>=6 and sev=="CRITICAL") or (4<=r["s"]<6 and sev=="HIGH") or (r["s"]<4 and sev=="MEDIUM")]
    if not items: continue
    sl=SLAB[sev]
    risk_map_html+=f'<div class="rm-group"><div class="rm-sev" style="background:{sl["bg"]};border-color:{sl["c"]}"><span class="rm-dot" style="background:{sl["c"]}"></span>{sl["label"]}<span class="rm-cnt">{len(items)}</span></div>'
    for r in items:
        risk_map_html+=f'<div class="rm-item"><span class="rm-icon">{r["info"]["i"]}</span><span class="rm-text">{e(r["hl"])}</span><span class="rm-meta">{r["info"]["l"]} · {r["info"]["o"]}</span></div>'
    risk_map_html+='</div>'

# No risks
if not risks:
    risk_map_html='<div class="rm-empty">✅ No risks detected — all tests passed</div>'

# ── Risk Cards ───────────────────────────────────────────────────────────
cards=""
for i,r in enumerate(risks):
    t=r["t"]; cerr=re.sub(r'\[[\d;]*m','',t["error"])[:300]
    sv="CRITICAL" if r["s"]>=6 else "HIGH" if r["s"]>=4 else "MEDIUM"
    svc=SLAB[sv]["c"]
    fb='<span class="tag t-fl">FLAKY</span>' if r["flaky"] else '<span class="tag t-fa">FAIL</span>'
    bb=f'<span class="tag t-bug">KNOWN BUG</span>' if t.get("issue") else ""

    cards+=f'''<div class="glass card" style="border-left:3px solid {r["info"]["c"]}">
  <div class="c-top">
    <span class="c-sv" style="background:{svc}">{sv}</span>
    <span class="c-sc">{r["s"]}/9</span>
    {fb}{bb}
    <span class="tag t-m">{e(t["module"])}</span>
    {f'<span class="tag t-id">{e(t["trid"])}</span>' if t["trid"] else ""}
    <span class="c-own">👤 {r["info"]["o"]}</span>
  </div>
  <div class="c-hl">{r["info"]["i"]} {e(r["hl"])}</div>
  <div class="c-nr">{e(r["nr"])}</div>
  <div class="c-bars">
    <div class="c-bi"><span class="c-bl">Likelihood</span><div class="bar"><div class="fill" style="width:{r["L"]*33}%;background:{r["info"]["c"]}">{["","Rare","Possible","Likely"][r["L"]]}</div></div></div>
    <div class="c-bi"><span class="c-bl">Impact</span><div class="bar"><div class="fill" style="width:{r["I"]*33}%;background:{r["info"]["c"]}">{["","Low","Medium","High"][r["I"]]}</div></div></div>
  </div>
  {"<details class='c-err'><summary>View error detail</summary><pre>"+e(cerr)+"</pre></details>" if cerr else ""}
</div>'''

# ── Exit Criteria ────────────────────────────────────────────────────────
ec_html="".join(f'<div class="ec {"ec-ok" if v else "ec-no"}">{"✅" if v else "❌"} {e(l)}</div>' for l,v in ec)

# ── Module chips ─────────────────────────────────────────────────────────
mh="".join(f'<span class="chip c-ok">{e(m)} <em>{ms[m]["p"]}/{ms[m]["t"]}</em></span>' for m in healthy)
mr="".join(f'<span class="chip c-risk">{e(m)} <em>{ms[m]["f"]}F/{ms[m]["t"]}</em></span>' for m in atrisk)

# ── Meeting script ───────────────────────────────────────────────────────
msc=""
for i,r in enumerate(risks[:4]):
    msc+=f'<div class="ms-i"><strong>{i+1}.</strong> {r["info"]["i"]} <strong>{e(r["hl"])}</strong><br><span class="ms-sub">👉 {e(r["nr"][:120])}</span></div>'

# ── HTML ─────────────────────────────────────────────────────────────────
html=f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Risk Report — {e(PN)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{{--brand:#04be8c;--brand-dim:#04be8c20;--brand-glow:#04be8c40;--bg:#0a0a0f;--card:rgba(255,255,255,.035);--border:rgba(255,255,255,.06);--text:#e4e4e7;--muted:#71717a;--dim:#3f3f46;--surface:#111116}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Inter',system-ui;background:var(--bg);color:var(--text);min-height:100vh}}
body::before{{content:'';position:fixed;inset:0;background:
  radial-gradient(ellipse 80% 50% at 20% 0%,rgba(4,190,140,.07),transparent 70%),
  radial-gradient(ellipse 60% 40% at 80% 100%,rgba(4,190,140,.04),transparent 70%);
  pointer-events:none;z-index:0}}

.wrap{{position:relative;z-index:1;max-width:880px;margin:0 auto;padding:56px 28px 72px}}

.glass{{background:var(--card);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:14px}}

/* ── Header ── */
.hdr{{text-align:center;margin-bottom:48px}}
.hdr .logo{{display:inline-flex;align-items:center;gap:6px;color:var(--brand);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}}
.hdr .logo::before,.hdr .logo::after{{content:'';width:24px;height:1px;background:var(--brand-glow)}}
.hdr h1{{font-size:32px;font-weight:800;color:#fafafa;letter-spacing:-.5px}}
.hdr .sub{{font-size:12px;color:var(--dim);margin-top:8px}}
.hdr .env{{display:inline-block;background:var(--brand-dim);color:var(--brand);border:1px solid var(--brand-glow);padding:3px 14px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:14px}}

/* ── Verdict ── */
.verdict{{text-align:center;padding:40px 28px;margin-bottom:40px}}
.v-icon{{font-size:48px;margin-bottom:6px}}
.v-text{{font-size:26px;font-weight:800;color:{vc}}}
.v-sub{{font-size:13px;color:var(--muted);margin-top:4px}}
.v-nums{{display:flex;justify-content:center;gap:56px;margin-top:28px}}
.v-n{{text-align:center}}.v-n .n{{font-size:30px;font-weight:800;color:#fafafa}}.v-n .l{{font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:2px;margin-top:2px}}

/* ── Section ── */
.sec{{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--dim);margin:40px 0 14px;display:flex;align-items:center;gap:8px}}
.sec .n{{color:var(--muted);font-weight:500}}

/* ── Risk Map (clear visual) ── */
.rm{{margin-bottom:32px}}
.rm-group{{margin-bottom:16px}}
.rm-sev{{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;border:1px solid;font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px}}
.rm-dot{{width:8px;height:8px;border-radius:50%;flex-shrink:0}}
.rm-cnt{{margin-left:auto;font-size:11px;color:var(--muted);font-weight:500}}
.rm-item{{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 36px;font-size:13px;border-bottom:1px solid rgba(255,255,255,.03)}}
.rm-item:last-child{{border:none}}
.rm-icon{{font-size:16px;flex-shrink:0}}
.rm-text{{color:var(--text);font-weight:500}}
.rm-meta{{margin-left:auto;font-size:10px;color:var(--dim);white-space:nowrap}}
.rm-empty{{padding:20px;text-align:center;color:var(--brand);font-size:14px}}

/* ── Risk Cards ── */
.card{{padding:22px 24px;margin-bottom:10px;transition:transform .15s,box-shadow .15s}}
.card:hover{{transform:translateY(-1px);box-shadow:0 12px 40px rgba(0,0,0,.35)}}
.c-top{{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:10px}}
.c-sv{{padding:2px 10px;border-radius:8px;font-size:9px;font-weight:800;color:#fff;letter-spacing:.3px}}
.c-sc{{font-size:10px;color:var(--dim)}}.c-own{{font-size:10px;color:var(--dim);margin-left:auto}}
.tag{{padding:1px 7px;border-radius:5px;font-size:9px;font-weight:600}}
.t-fa{{background:#ef444415;color:#fca5a5;border:1px solid #ef444425}}
.t-fl{{background:#f59e0b15;color:#fcd34d;border:1px solid #f59e0b25}}
.t-bug{{background:#a855f715;color:#c4b5fd;border:1px solid #a855f725}}
.t-m{{background:var(--brand-dim);color:var(--brand);border:1px solid var(--brand-glow)}}
.t-id{{background:var(--surface);color:var(--dim);border:1px solid rgba(255,255,255,.05)}}
.c-hl{{font-size:16px;font-weight:700;color:#fafafa;margin-bottom:4px}}
.c-nr{{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:14px}}
.c-bars{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}
.c-bi{{}}
.c-bl{{font-size:9px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;display:block}}
.bar{{height:20px;background:var(--surface);border-radius:6px;overflow:hidden}}
.fill{{height:100%;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;min-width:36px}}
.c-err{{margin-top:10px}}.c-err summary{{font-size:11px;color:var(--dim);cursor:pointer}}.c-err summary:hover{{color:var(--muted)}}
.c-err pre{{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:10px;color:#ef4444;white-space:pre-wrap;word-break:break-all;margin-top:6px;max-height:120px;overflow-y:auto;font-family:'SF Mono',monospace}}

/* ── Exit Criteria ── */
.ec-wrap{{padding:18px 22px;margin-bottom:28px}}
.ec{{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:13px;display:flex;align-items:center;gap:8px}}.ec:last-child{{border:none}}
.ec-ok{{color:var(--brand)}}.ec-no{{color:#fca5a5}}
.ec-bar{{margin-top:12px;height:4px;background:var(--surface);border-radius:2px;overflow:hidden}}
.ec-fill{{height:100%;background:linear-gradient(90deg,var(--brand),#06b6d4);border-radius:2px}}

/* ── Chips ── */
.chips{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}}
.chip{{padding:5px 12px;border-radius:12px;font-size:11px;font-weight:500;display:flex;align-items:center;gap:4px}}
.chip em{{font-style:normal;color:var(--dim);font-size:10px}}
.c-ok{{background:var(--brand-dim);border:1px solid var(--brand-glow);color:var(--brand)}}
.c-risk{{background:#ef444410;border:1px solid #ef444420;color:#fca5a5}}

/* ── Meeting Script ── */
.ms{{padding:24px;margin-top:28px}}
.ms h3{{font-size:13px;font-weight:700;color:#fafafa;margin-bottom:16px;letter-spacing:.3px}}
.ms-box{{background:var(--surface);border-left:2px solid var(--brand);border-radius:0 10px 10px 0;padding:20px 24px;font-size:13px;color:var(--muted);line-height:1.9}}
.ms-box strong{{color:#fafafa}}.ms-box .sp{{color:var(--brand);font-weight:700}}
.ms-i{{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}}.ms-i:last-child{{border:none}}
.ms-sub{{color:var(--dim);font-size:12px}}

/* ── Footer ── */
.foot{{text-align:center;padding:40px 0 0;font-size:10px;color:#27272a;margin-top:44px}}
.foot a{{color:var(--brand);text-decoration:none}}.foot em{{color:var(--dim)}}

/* ── Divider ── */
.divider{{height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent);margin:8px 0}}

@media(max-width:640px){{.wrap{{padding:24px 14px}}.v-nums{{gap:28px;flex-wrap:wrap}}.c-bars{{grid-template-columns:1fr}}}}
</style></head><body>
<div class="wrap">

<div class="hdr">
  <div class="logo">Amity · QA</div>
  <h1>{e(PN)}</h1>
  <div class="sub">{now} · {ds} · {active} tests · {len(ms)} modules</div>
  <div class="env">{ENV}</div>
</div>

<div class="glass verdict">
  <div class="v-icon">{vi}</div>
  <div class="v-text">{vt}</div>
  <div class="v-sub">{vx}</div>
  <div class="v-nums">
    <div class="v-n"><div class="n">{pr:.0f}%</div><div class="l">Pass Rate</div></div>
    <div class="v-n"><div class="n" style="color:{'#fca5a5' if failed else 'var(--brand)'}">{len(failed)}</div><div class="l">Failed</div></div>
    <div class="v-n"><div class="n">{len(risks)}</div><div class="l">Risks</div></div>
    <div class="v-n"><div class="n">{ecm}/{len(ec)}</div><div class="l">Exit Criteria</div></div>
  </div>
</div>

<div class="sec">Risk Overview</div>
<div class="glass rm">
  {risk_map_html}
</div>

<div class="sec">Release Readiness <span class="n">{ecm}/{len(ec)}</span></div>
<div class="glass ec-wrap">
  {ec_html}
  <div class="ec-bar"><div class="ec-fill" style="width:{ecm/len(ec)*100 if ec else 0}%"></div></div>
</div>

{"<div class='sec'>Areas of Concern <span class=n>"+str(len(risks))+"</span></div>" if risks else ""}
{cards}

<div class="sec">Stable Modules <span class="n">{len(healthy)}</span></div>
<div class="chips">{mh or '<span style="color:var(--dim)">—</span>'}</div>

{"<div class='sec'>At Risk <span class=n>"+str(len(atrisk))+"</span></div><div class='chips'>"+mr+"</div>" if atrisk else ""}

<div class="glass ms">
  <h3>🎤 Meeting Script — Copy & Present</h3>
  <div class="ms-box">
    <span class="sp">QA Engineer:</span><br><br>
    We verified <strong>{active} scenarios</strong> across {len(ms)} modules for <strong>{e(PN)}</strong>.<br>
    {"<strong>"+str(len(healthy))+" modules</strong> are fully stable with 100% pass rate. " if healthy else ""}
    {f"We found <strong>{len(risks)} concern{'s' if len(risks)>1 else ''}</strong>:" if risks else "<strong>All modules are stable — no risks found. ✅</strong>"}
    {msc}
    {"<br>" if risks else ""}
    <div class="divider"></div>
    Exit criteria: <strong>{ecm}/{len(ec)}</strong> met.<br>
    My recommendation: <strong style="color:{vc}">{vt}</strong>
  </div>
</div>

<div class="foot">
  <a href="https://www.amity.co">Amity</a> · QA Automation Report v4.0<br>
  <em>"You can have Story without numbers, but never numbers without Story"</em>
</div>

</div></body></html>'''

os.makedirs(os.path.dirname(OH) or ".",exist_ok=True)
with open(OH,"w",encoding="utf-8") as f: f.write(html)
print("="*60)
print(f"✅ Risk Story Report v4.0 (Amity Edition): {OH}")
print(f"   {vi} {vt} | {pr:.0f}% | {len(risks)} risks | {ecm}/{len(ec)} exit")
for i,r in enumerate(risks[:3]):
    sv="CRIT" if r["s"]>=6 else "HIGH" if r["s"]>=4 else "MED"
    print(f"   #{i+1} [{sv}] {r['info']['i']} {r['hl'][:50]}")
print("="*60)
