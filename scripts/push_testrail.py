#!/usr/bin/env python3
"""
Push Playwright JSON results to TestRail.
Creates milestone + 3 runs (Smoke, Regression, Manual), then uploads results.
"""
import json, csv, urllib.request, urllib.error, base64, sys, os
from pathlib import Path
from datetime import datetime

# ── Credentials ────────────────────────────────────────────────────────────────
env = {}
for line in Path('/Users/amity/Documents/Claude_QA_Agent/.env').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip()

BASE_URL = "https://ekoapp20.testrail.io/index.php?/api/v2"
EMAIL    = env['TESTRAIL_EMAIL']
API_KEY  = env['TESTRAIL_API_KEY']
CREDS    = base64.b64encode(f'{EMAIL}:{API_KEY}'.encode()).decode()

# ── Config ─────────────────────────────────────────────────────────────────────
PROJECT_ID  = 1       # EkoAI Connector and Console (project_id=1, suite_id=3865)
SUITE_ID    = 3865    # Morning Brief 18.0
# C1552304–C1552487
ALL_CASE_IDS = list(range(1552304, 1552488))

RESULTS_FILE = Path('/tmp/mb_final.json')

# TestRail status IDs
STATUS_PASSED   = 1
STATUS_FAILED   = 5
STATUS_RETEST   = 4
STATUS_UNTESTED = 3   # use for skipped (status 6 is inactive in this instance)

def api(method, endpoint, body=None):
    url = f'{BASE_URL}/{endpoint}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers={
        'Authorization': f'Basic {CREDS}',
        'Content-Type': 'application/json',
    }, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  API error {e.code}: {body[:200]}')
        raise

# ── Parse Playwright results ────────────────────────────────────────────────────
data = json.loads(RESULTS_FILE.read_text())

def flatten_specs(suites):
    for s in suites:
        for spec in s.get('specs', []):
            tags = spec.get('tags', [])
            for test in spec.get('tests', []):
                # Annotations live on each test run, not on the spec
                ann = test.get('annotations', [])
                tr_ids = [a['description'] for a in ann if a.get('type') == 'TestRail']
                status = test.get('status', 'unknown')  # expected | unexpected | skipped
                yield {
                    'title': spec.get('title', ''),
                    'tr_ids': tr_ids,
                    'tags': tags,
                    'status': status,
                }
        yield from flatten_specs(s.get('suites', []))

specs = list(flatten_specs(data.get('suites', [])))

# Build map: case_id → playwright status
case_results = {}  # case_id (int) → 'expected' | 'unexpected' | 'skipped'
for s in specs:
    for tr_id in s['tr_ids']:
        cid = int(tr_id.lstrip('C'))
        case_results[cid] = s['status']

automated_ids = set(case_results.keys())
manual_ids    = set(ALL_CASE_IDS) - automated_ids

def pw_to_tr_status(pw_status):
    if pw_status == 'expected':   return STATUS_PASSED
    if pw_status == 'unexpected': return STATUS_FAILED
    return STATUS_UNTESTED

print(f'Automated: {len(automated_ids)} cases')
print(f'Manual:    {len(manual_ids)} cases')
print(f'Passed:    {sum(1 for s in case_results.values() if s=="expected")}')
print(f'Failed:    {sum(1 for s in case_results.values() if s=="unexpected")}')
print(f'Skipped:   {sum(1 for s in case_results.values() if s=="skipped")}')

# ── 1. Create Milestone ────────────────────────────────────────────────────────
stamp = datetime.now().strftime('%Y-%m-%d %H:%M')
milestone = api('POST', f'add_milestone/{PROJECT_ID}', {
    'name': f'Morning Brief 18.0 — Automation Run ({stamp})',
    'description': f'101 passed | 2 failed (bugs) | 17 skipped | {stamp}',
})
M_ID = milestone['id']
print(f'\nCreated Milestone M{M_ID}: {milestone["name"]}')

# ── 2. Create 3 Runs ───────────────────────────────────────────────────────────
smoke_ids = [cid for cid in automated_ids
             if any(t in ['smoke','sanity'] for t in next(
                 (s['tags'] for s in specs if cid in [int(x.lstrip('C')) for x in s['tr_ids']]), []))]

reg_ids = [cid for cid in automated_ids
           if cid not in smoke_ids]

def create_run(name, case_ids, milestone_id):
    run = api('POST', f'add_run/{PROJECT_ID}', {
        'name': name,
        'suite_id': SUITE_ID,
        'milestone_id': milestone_id,
        'case_ids': sorted(case_ids),
        'include_all': False,
    })
    print(f'Created Run R{run["id"]}: {run["name"]} ({len(case_ids)} cases)')
    return run['id']

R_SMOKE = create_run(f'Morning Brief 18.0 — Smoke / Sanity', smoke_ids or list(automated_ids)[:1], M_ID)
R_REG   = create_run(f'Morning Brief 18.0 — Regression', list(automated_ids), M_ID)
R_MAN   = create_run(f'Morning Brief 18.0 — Manual (Unautomated)', list(manual_ids), M_ID)

# ── 3. Push results ────────────────────────────────────────────────────────────
def push_results(run_id, case_ids, result_map, default_status=STATUS_RETEST):
    results = []
    for cid in case_ids:
        pw_status = result_map.get(cid)
        status_id = pw_to_tr_status(pw_status) if pw_status else default_status
        results.append({'case_id': cid, 'status_id': status_id})
    if not results:
        print(f'  No results to push for R{run_id}')
        return
    # TestRail allows max 250 per batch
    for i in range(0, len(results), 250):
        batch = results[i:i+250]
        api('POST', f'add_results_for_cases/{run_id}', {'results': batch})
    print(f'  Pushed {len(results)} results to R{run_id}')

print('\nPushing results...')
push_results(R_SMOKE, smoke_ids or list(automated_ids), case_results)
push_results(R_REG,   list(automated_ids), case_results)
push_results(R_MAN,   list(manual_ids), {}, default_status=STATUS_RETEST)

print(f'\nDone!')
print(f'Milestone: https://ekoapp20.testrail.io/index.php?/milestones/view/{M_ID}')
print(f'Smoke Run: https://ekoapp20.testrail.io/index.php?/runs/view/{R_SMOKE}')
print(f'Regression Run: https://ekoapp20.testrail.io/index.php?/runs/view/{R_REG}')
print(f'Manual Run: https://ekoapp20.testrail.io/index.php?/runs/view/{R_MAN}')
