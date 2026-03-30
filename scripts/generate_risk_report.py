#!/usr/bin/env python3
"""
Risk Story Report v3.0 — Glassmorphism Edition
================================================
Dark glassmorphism design with minimal, scannable layout.
Answers ONE question: "Is this release safe?"

Design: Dark Glassmorphism (2026 trend)
  - backdrop-filter: blur(16px)
  - rgba(255,255,255,0.05) cards
  - Vibrant gradient mesh background
  - Compact, scannable, no clutter
"""
import json,sys,os,re,math,datetime,html as H
from collections import defaultdict

args=sys.argv[1:]
RJ=args[0] if len(args)>0 else None
OH=args[1] if len(args)>1 else None
PN=args[2] if len(args)>2 else "EkoAI Console QA"
ENV=args[3] if len(args)>3 else "staging"

if not RJ:
    for c in [f"reports/{ENV}/results.json","reports/staging/results.json"]:
        if os.path.exists(c): RJ=c; break
if not OH:
    OH=os.path.join(os.path.dirname(RJ) if RJ else f"reports/{ENV}","risk-story-report.html")
if not RJ or not os.path.exists(RJ): print("ERROR: results.json not found"); sys.exit(1)

with open(RJ) as f: data=json.load(f)

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
                    d["trid"]="";d["issue"]="";d["pri"]="P2";d["tags"]=[]
                    for a in d["annotations"]:
                        if a.get("type")=="TestRail": d["trid"]=a.get("description","")
                        if a.get("type")=="issue": d["issue"]=a.get("description","")
                    if "@P1" in str(d.get("tags",""))+d["title"]: d["pri"]="P1"
                    mod="Unknown"
                    for pt in reversed(t.replace("Morning Brief — ","").replace("Morning Brief —","").split(" > ")):
                        pt=pt.strip()
                        if pt and pt not in ("","e2e","tests","agentic","morning-brief"): mod=pt; break
                    d["module"]=mod; tests.append(d)
        tests.extend(extract(s.get("suites",[]),t))
    return tests

all_t=extract(data.get("suites",[]))
seen={}
for t in all_t:
    k=t["trid"] or t["title"]
    if k not in seen or t["retry"]>seen[k]["retry"]: seen[k]=t
tests=list(seen.values())

total=len(tests)
passed=[t for t in tests if t["status"]=="passed"]
failed=[t for t in tests if t["status"]=="failed"]
flaky=[t for t in tests if t["status"]=="passed" and t["retry"]>0]
skipped=[t for t in tests if t["status"]=="skipped"]
active=total-len(skipped)
pr=(len(passed)/active*100) if active>0 else 0

CATS={"DATA":{"i":"🔒","l":"Data","c":"#f43f5e","o":"Backend","kw":["save","persist","update","delete","create","duplicate","validation","empty","required","database"]},
      "UX":{"i":"😤","l":"UX","c":"#f97316","o":"Frontend","kw":["display","show","visible","hidden","render","widget","UI","modal","button","click","layout"]},
      "LOGIC":{"i":"⚙️","l":"Logic","c":"#a855f7","o":"Backend","kw":["recurrence","schedule","interval","occurrences","custom","repeat","RRULE","trigger","process","callback","cron"]},
      "SECURITY":{"i":"🛡️","l":"Security","c":"#3b82f6","o":"Security","kw":["auth","permission","401","403","token","API key","security"]},
      "PERF":{"i":"⚡","l":"Performance","c":"#64748b","o":"DevOps","kw":["timeout","ERR_","network","500","502","503","connection","slow","large","load"]},
      "DELIVERY":{"i":"📬","l":"Delivery","c":"#06b6d4","o":"Product","kw":["audience","recipient","group","delivery","home page","notification","member"]}}

def classify(t):
    txt=f"{t['title']} {t['error']} {t['module']}".lower()
    sc={c:sum(1 for kw in info["kw"] if kw.lower() in txt) for c,info in CATS.items()}
    return max(sc,key=sc.get) if any(v>0 for v in sc.values()) else "UX"

def lhood(t): return 3 if t["status"]=="failed" and t["retry"]==0 else 2 if t["retry"]>0 else 1
def impact(t):
    txt=f"{t['title']} {t['error']}".lower()
    if any(k in txt for k in ["data loss","delete","payment","security","auth","500"]): return 3
    if any(k in txt for k in ["save","create","schedule","delivery","audience"]): return 3
    if any(k in txt for k in ["validation","display","render","timeout","large"]): return 2
    return 1

def story(t):
    tl=t["title"].lower(); m=t["module"]
    if "recurrence" in tl or "schedule" in tl or "repeat" in tl:
        return("Scheduled jobs may run at wrong times","Jobs could fire at incorrect intervals, affecting all Morning Brief deliveries.")
    elif "audience" in tl or "recipient" in tl or "group" in tl:
        return("Some users may miss their Morning Brief","Audience targeting has issues — users could be excluded from delivery lists.")
    elif "widget" in tl or "render" in tl or "content" in tl:
        return("Brief content may display broken","Users may see broken layouts or missing data instead of their personalized brief.")
    elif "validation" in tl or "empty" in tl:
        return("Invalid data can slip through forms",f"{m} forms may accept incomplete input, creating broken configurations.")
    elif "delete" in tl or "remove" in tl:
        return("Delete flow has reliability issues","Deleting items may leave orphaned records or show unexpected errors.")
    elif "timeout" in tl or "large" in tl or "500" in tl:
        return("System struggles under load",f"{m} may slow down for users with large teams or high-volume data.")
    elif "toggle" in tl or "status" in tl or "active" in tl:
        return("Job toggle may be unreliable","Admins may think a job is active when it isn't, or vice versa.")
    else:
        return(f"{m} has unexpected behavior","Feature may not work correctly under certain conditions.")

risks=[]
for t in failed+[f for f in flaky if f not in failed]:
    cat=classify(t); L=lhood(t); I=impact(t)
    hl,narr=story(t)
    risks.append({"t":t,"cat":cat,"info":CATS[cat],"L":L,"I":I,"s":L*I,"hl":hl,"narr":narr,"flaky":t in flaky})
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
ec=[("Pass rate ≥ 95%",pr>=95),("Zero P1 failures",len(p1f)==0),("No data integrity risks",not any(r["cat"]=="DATA" and r["s"]>=6 for r in risks)),
    ("No security risks",not any(r["cat"]=="SECURITY" and r["s"]>=4 for r in risks)),("Critical modules stable",all(ms[m]["f"]==0 for m in ["Create Scheduled Job","Dashboard","Job Configuration"] if m in ms))]
ecm=sum(1 for _,v in ec if v)

if pr>=95 and len(p1f)==0: vd="GO";vi="✅";vt="Ready for Release";vc="#10b981";vx="All critical paths verified. Ship it."
elif pr>=80 and len(p1f)==0: vd="CONDITIONAL";vi="⚠️";vt="Conditional Release";vc="#f59e0b";vx="Review concerns below before deciding."
else: vd="NO-GO";vi="🛑";vt="Not Ready";vc="#ef4444";vx=f"{len(p1f)} P1 issue(s) block release."

now=datetime.datetime.now().strftime("%b %d, %Y · %I:%M %p")
dur=sum(t["duration"] for t in tests)/1000
ds=f"{int(dur//60)}m {int(dur%60)}s"
e=lambda t:H.escape(str(t)) if t else ""

# Heat map 3x3
hm=[[[] for _ in range(3)] for _ in range(3)]
for r in risks: hm[2-min(r["I"]-1,2)][min(r["L"]-1,2)].append(r)

hmc_html=""
hmcolors=[["#10b981","#f59e0b","#ef4444"],["#10b981","#f59e0b","#f97316"],["#10b981","#10b981","#f59e0b"]]
for ri in range(3):
    for ci in range(3):
        items=hm[ri][ci]; bg=hmcolors[ri][ci]
        op="15" if not items else "40"
        dots="".join(f'<span title="{e(r["t"]["title"][:40])}">{r["info"]["i"]}</span>' for r in items[:3])
        ext=f'<span style="font-size:9px;opacity:.7">+{len(items)-3}</span>' if len(items)>3 else ""
        hmc_html+=f'<div class="hm-c" style="background:{bg}{op};border:1px solid {bg}50">{dots}{ext}{"<span style=opacity:.3>—</span>" if not items else ""}</div>'

# Risk cards
cards=""
for i,r in enumerate(risks):
    t=r["t"]; cerr=re.sub(r'\[[\d;]*m','',t["error"])[:300]
    sv="CRITICAL" if r["s"]>=6 else "HIGH" if r["s"]>=4 else "MEDIUM"
    svc={"CRITICAL":"#ef4444","HIGH":"#f97316","MEDIUM":"#f59e0b"}.get(sv,"#64748b")
    fb='<span class="tag t-fl">FLAKY</span>' if r["flaky"] else '<span class="tag t-fa">FAIL</span>'
    bb=f'<span class="tag t-bug">BUG</span>' if t.get("issue") else ""
    bars_l=f'<div class="bar"><div class="fill" style="width:{r["L"]*33}%;background:{r["info"]["c"]}">{["","Rare","Possible","Likely"][r["L"]]}</div></div>'
    bars_i=f'<div class="bar"><div class="fill" style="width:{r["I"]*33}%;background:{r["info"]["c"]}">{["","Low","Med","High"][r["I"]]}</div></div>'

    cards+=f'''<div class="glass risk" style="--ac:{r["info"]["c"]}">
  <div class="r-top"><span class="r-sv" style="background:{svc}">{sv}</span><span class="r-sc">{r["s"]}/9</span>{fb}{bb}<span class="tag t-m">{e(t["module"])}</span>{f'<span class="tag t-id">{e(t["trid"])}</span>' if t["trid"] else ""}<span class="r-own">👤 {r["info"]["o"]}</span></div>
  <div class="r-hl">{r["info"]["i"]} {e(r["hl"])}</div>
  <div class="r-nr">{e(r["narr"])}</div>
  <div class="r-bars"><div><span class="r-bl">Likelihood</span>{bars_l}</div><div><span class="r-bl">Impact</span>{bars_i}</div></div>
  {"<details class=r-err><summary>Error detail</summary><pre>"+e(cerr)+"</pre></details>" if cerr else ""}
</div>'''

# Exit criteria
ec_html="".join(f'<div class="ec {"ec-ok" if v else "ec-no"}">{"✅" if v else "❌"} {e(l)}</div>' for l,v in ec)

# Module chips
mh="".join(f'<span class="chip c-ok">{e(m)} {ms[m]["p"]}/{ms[m]["t"]}</span>' for m in healthy)
mr="".join(f'<span class="chip c-risk">{e(m)} {ms[m]["f"]}F/{ms[m]["t"]}</span>' for m in atrisk)

# Meeting script
msc=""
for i,r in enumerate(risks[:4]):
    msc+=f'<div class="ms-i"><strong>{i+1}.</strong> {r["info"]["i"]} {e(r["hl"])}<br><span class="ms-imp">👉 {e(r["narr"][:120])}</span></div>'

html=f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Risk Report — {e(PN)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Inter',system-ui;background:#09090b;color:#e4e4e7;min-height:100vh;overflow-x:hidden}}
body::before{{content:'';position:fixed;inset:0;background:
  radial-gradient(ellipse 80% 60% at 10% 20%,rgba(99,102,241,.12),transparent),
  radial-gradient(ellipse 60% 50% at 90% 80%,rgba(168,85,247,.08),transparent),
  radial-gradient(ellipse 50% 40% at 50% 50%,rgba(14,165,233,.06),transparent);
  pointer-events:none;z-index:0}}

.wrap{{position:relative;z-index:1;max-width:960px;margin:0 auto;padding:48px 32px 64px}}

/* Glass */
.glass{{background:rgba(255,255,255,.04);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px 28px}}

/* Header */
.hdr{{text-align:center;margin-bottom:40px}}
.hdr h1{{font-size:14px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#71717a;margin-bottom:8px}}
.hdr h2{{font-size:28px;font-weight:800;color:#fafafa;margin-bottom:6px}}
.hdr .sub{{font-size:13px;color:#52525b}}
.env{{display:inline-block;background:{vc}20;color:{vc};border:1px solid {vc}40;padding:3px 14px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:12px}}

/* Verdict */
.verdict{{text-align:center;margin-bottom:36px;padding:36px 28px}}
.v-icon{{font-size:52px;margin-bottom:8px}}
.v-text{{font-size:24px;font-weight:800;color:{vc}}}
.v-sub{{font-size:13px;color:#a1a1aa;margin-top:4px}}
.v-nums{{display:flex;justify-content:center;gap:48px;margin-top:24px}}
.v-n{{text-align:center}}.v-n .n{{font-size:28px;font-weight:800;color:#fafafa}}.v-n .l{{font-size:9px;color:#52525b;text-transform:uppercase;letter-spacing:1.5px;margin-top:2px}}

/* Section */
.sec{{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#52525b;margin:36px 0 12px;display:flex;align-items:center;gap:8px}}
.sec .cnt{{color:#71717a;font-weight:500}}

/* Heat Map */
.hm{{margin-bottom:28px;padding:20px}}
.hm-g{{display:grid;grid-template-columns:36px repeat(3,1fr);grid-template-rows:repeat(3,56px) 20px;gap:4px;max-width:340px;margin:0 auto}}
.hm-y{{display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:8px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:.5px}}
.hm-x{{display:flex;align-items:flex-start;justify-content:center;font-size:8px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:.5px;padding-top:4px}}
.hm-c{{border-radius:10px;display:flex;align-items:center;justify-content:center;gap:3px;font-size:14px;transition:transform .2s}}
.hm-c:hover{{transform:scale(1.08)}}

/* Risk Card */
.risk{{margin-bottom:12px;border-left:3px solid var(--ac);transition:transform .15s,box-shadow .15s}}
.risk:hover{{transform:translateY(-2px);box-shadow:0 16px 48px rgba(0,0,0,.4)}}
.r-top{{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}}
.r-sv{{padding:2px 10px;border-radius:8px;font-size:9px;font-weight:800;color:#fff;letter-spacing:.5px}}
.r-sc{{font-size:10px;color:#52525b}}.r-own{{font-size:10px;color:#52525b;margin-left:auto}}
.tag{{padding:1px 8px;border-radius:6px;font-size:9px;font-weight:600}}
.t-fa{{background:#ef444418;color:#fca5a5;border:1px solid #ef444430}}
.t-fl{{background:#f59e0b18;color:#fcd34d;border:1px solid #f59e0b30}}
.t-bug{{background:#a855f718;color:#c4b5fd;border:1px solid #a855f730}}
.t-m{{background:#10b98118;color:#6ee7b7;border:1px solid #10b98130}}
.t-id{{background:#18181b;color:#52525b;border:1px solid #27272a}}
.r-hl{{font-size:16px;font-weight:700;color:#fafafa;margin-bottom:6px}}
.r-nr{{font-size:13px;color:#a1a1aa;line-height:1.6;margin-bottom:14px}}
.r-bars{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}
.r-bl{{font-size:9px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;display:block}}
.bar{{height:20px;background:#18181b;border-radius:6px;overflow:hidden}}
.fill{{height:100%;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;min-width:40px}}
.r-err{{margin-top:10px}}.r-err summary{{font-size:11px;color:#3f3f46;cursor:pointer;transition:color .2s}}.r-err summary:hover{{color:#71717a}}
.r-err pre{{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:12px;font-size:10px;color:#ef4444;white-space:pre-wrap;word-break:break-all;margin-top:6px;max-height:140px;overflow-y:auto;font-family:'SF Mono','Fira Code',monospace}}

/* Exit Criteria */
.ec-wrap{{margin-bottom:28px;padding:20px 24px}}
.ec{{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;display:flex;align-items:center;gap:8px}}
.ec:last-child{{border:none}}
.ec-ok{{color:#6ee7b7}}.ec-no{{color:#fca5a5}}
.ec-bar{{margin-top:12px;height:4px;background:#18181b;border-radius:2px;overflow:hidden}}
.ec-fill{{height:100%;background:linear-gradient(90deg,#10b981,#06b6d4);border-radius:2px}}

/* Chips */
.chips{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}}
.chip{{padding:4px 12px;border-radius:14px;font-size:11px;font-weight:500}}
.c-ok{{background:#10b98110;border:1px solid #10b98120;color:#6ee7b7}}
.c-risk{{background:#ef444410;border:1px solid #ef444420;color:#fca5a5}}

/* Meeting */
.ms{{margin-top:24px;padding:24px}}
.ms h3{{font-size:14px;font-weight:700;color:#fafafa;margin-bottom:16px}}
.ms-box{{background:#18181b;border-left:2px solid #10b981;border-radius:0 10px 10px 0;padding:20px 24px;font-size:13px;color:#a1a1aa;line-height:1.9}}
.ms-box strong{{color:#fafafa}}.ms-box .sp{{color:#6ee7b7;font-weight:700}}
.ms-i{{padding:6px 0;border-bottom:1px solid #27272a}}.ms-i:last-child{{border:none}}
.ms-imp{{color:#71717a;font-size:12px}}

/* Footer */
.foot{{text-align:center;padding:40px 0 0;font-size:10px;color:#27272a;border-top:1px solid #18181b;margin-top:40px}}
.foot em{{color:#3f3f46}}

@media(max-width:640px){{.wrap{{padding:24px 16px}}.v-nums{{gap:24px}}.r-bars{{grid-template-columns:1fr}}.hm-g{{max-width:100%}}}}
</style></head><body>
<div class="wrap">

<div class="hdr">
  <h1>Risk Story Report</h1>
  <h2>{e(PN)}</h2>
  <div class="sub">{now} · {ds} · {active} tests · {len(ms)} modules</div>
  <div class="env">{ENV}</div>
</div>

<div class="glass verdict">
  <div class="v-icon">{vi}</div>
  <div class="v-text">{vt}</div>
  <div class="v-sub">{vx}</div>
  <div class="v-nums">
    <div class="v-n"><div class="n">{pr:.0f}%</div><div class="l">Pass Rate</div></div>
    <div class="v-n"><div class="n" style="color:{'#fca5a5' if failed else '#6ee7b7'}">{len(failed)}</div><div class="l">Failed</div></div>
    <div class="v-n"><div class="n">{len(risks)}</div><div class="l">Risks</div></div>
    <div class="v-n"><div class="n">{ecm}/{len(ec)}</div><div class="l">Exit Criteria</div></div>
  </div>
</div>

{"<div class='sec'>Risk Heat Map</div><div class='glass hm'><div class='hm-g'>" +
 "<div class='hm-y' style='grid-row:1'>High</div><div class='hm-y' style='grid-row:2'>Med</div><div class='hm-y' style='grid-row:3'>Low</div>" +
 hmc_html +
 "<div></div><div class='hm-x'>Low</div><div class='hm-x'>Med</div><div class='hm-x'>High</div>" +
 "</div><div style='text-align:center;margin-top:8px;font-size:9px;color:#3f3f46'>← IMPACT · LIKELIHOOD →</div></div>" if risks else ""}

<div class="sec">Release Readiness <span class="cnt">{ecm}/{len(ec)}</span></div>
<div class="glass ec-wrap">
  {ec_html}
  <div class="ec-bar"><div class="ec-fill" style="width:{ecm/len(ec)*100 if ec else 0}%"></div></div>
</div>

{"<div class='sec'>Areas of Concern <span class=cnt>"+str(len(risks))+"</span></div>" if risks else ""}
{cards}

<div class="sec">Stable Modules <span class="cnt">{len(healthy)}</span></div>
<div class="chips">{mh or '<span style="color:#3f3f46">—</span>'}</div>

{"<div class='sec'>At Risk <span class=cnt>"+str(len(atrisk))+"</span></div><div class='chips'>"+mr+"</div>" if atrisk else ""}

<div class="glass ms">
  <h3>🎤 Meeting Script</h3>
  <div class="ms-box">
    <span class="sp">QA:</span> We verified <strong>{active} scenarios</strong> across {len(ms)} modules.<br>
    {"<strong>"+str(len(healthy))+" modules</strong> are fully stable. " if healthy else ""}
    {f"We found <strong>{len(risks)} concern{'s' if len(risks)>1 else ''}</strong>:" if risks else "<strong>No risks — all stable.</strong>"}
    {msc}
    {"<br>" if risks else ""}
    <br>Exit criteria: <strong>{ecm}/{len(ec)}</strong> met. Recommendation: <strong>{vt}</strong>
  </div>
</div>

<div class="foot">
  Claude QA Agent · Risk Story Report v3.0<br>
  <em>"Story without numbers is still valuable. Numbers without Story is noise."</em>
</div>

</div></body></html>'''

os.makedirs(os.path.dirname(OH) or ".",exist_ok=True)
with open(OH,"w",encoding="utf-8") as f: f.write(html)
print("="*60)
print(f"✅ Risk Story Report v3.0: {OH}")
print(f"   {vi} {vt} | {pr:.0f}% pass | {len(risks)} risks | {ecm}/{len(ec)} exit criteria")
for i,r in enumerate(risks[:3]):
    sv="CRIT" if r["s"]>=6 else "HIGH" if r["s"]>=4 else "MED"
    print(f"   #{i+1} [{sv}] {r['info']['i']} {r['hl'][:50]}")
print("="*60)
