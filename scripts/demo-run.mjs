#!/usr/bin/env node
/**
 * End-to-end demo: "give me run N" →
 *   1. Compose a fresh preset file (randomly-mixed widgets) named run-N.json
 *   2. Create scheduled job named "Sharp_Test — Run N" via API
 *   3. Wait for trigger (default 2 min from now)
 *   4. Run 4-layer verification on the delivered run-user
 *   5. Print report + links
 *
 * Usage:
 *   node scripts/demo-run.mjs                      # auto-increment run number
 *   node scripts/demo-run.mjs --run 42             # force run number
 *   node scripts/demo-run.mjs --delay 5m           # schedule further out
 *   node scripts/demo-run.mjs --name-prefix "My"   # custom name prefix
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PRESETS_DIR = join(REPO_ROOT, "src", "widget-webhook-server", "presets");

function popFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

const args = process.argv.slice(2);
const forceRun = popFlag(args, "--run");
const delay = popFlag(args, "--delay") || "2m";
const namePrefix = popFlag(args, "--name-prefix") || "Sharp_Test";
const audienceUserId = popFlag(args, "--audience") || "689d65d767fc177d804b1318"; // sharp

// ── Auth ─────────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL || "https://ekoai.staging.ekoapp.com";
const AUTH_STATE = join(REPO_ROOT, "playwright", ".auth", "staging-user.json");
const token = (() => {
  const state = JSON.parse(readFileSync(AUTH_STATE, "utf8"));
  return state.cookies.find(c => c.name.includes("idToken")).value;
})();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// ── Pick run number ──────────────────────────────────────────────────────────
let runN = forceRun ? parseInt(forceRun, 10) : 1;
if (!forceRun) {
  // Find highest existing run-N preset
  const existing = readdirSync(PRESETS_DIR)
    .map(f => f.match(/^run-(\d+)\.json$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  if (existing.length) runN = Math.max(...existing) + 1;
}
const presetName = `run-${runN}`;
const jobName = `${namePrefix} — Run ${runN}`;
console.log(`▶ Run #${runN} — preset="${presetName}" name="${jobName}"`);

// ── Step 1: Compose preset (randomly mix widgets) ────────────────────────────
const WIDGET_POOL = [
  "text", "baseContainer", "lineChart", "miniTable", "circular",
  "tabs", "tags", "collapsible", "markdown", "carousel", "selectTabs",
];
const CORE = ["text", "baseContainer", "lineChart"]; // always include these
const EXTRA_COUNT = 3 + Math.floor(Math.random() * 3); // 3-5 extra
const pool = WIDGET_POOL.filter(w => !CORE.includes(w));
const extras = [];
for (let i = 0; i < EXTRA_COUNT && pool.length; i++) {
  const idx = Math.floor(Math.random() * pool.length);
  extras.push(pool.splice(idx, 1)[0]);
}
const widgetTypes = [...CORE, ...extras];

const preset = {
  title: `${jobName}`,
  lang: "en",
  _generatedBy: "scripts/demo-run.mjs",
  _generatedAt: new Date().toISOString(),
  _runNumber: runN,
  widgets: widgetTypes.map((t, i) => {
    const w = { type: t };
    if (t === "text" && i === 0) {
      w.title = `Hello {{displayName}} — Run #${runN}`;
      w.subtitle = "Updated {{homePageUpdatedAtFormatted}}";
      w.text = `Auto-generated brief for run #${runN}. Composed at ${new Date().toISOString()} with widgets: ${widgetTypes.join(", ")}.`;
    }
    if (t === "baseContainer") {
      w.title = `Run #${runN} — Key Metrics`;
      w.subtitle = `Randomly composed from ${widgetTypes.length} widgets`;
    }
    return w;
  }),
};
writeFileSync(join(PRESETS_DIR, `${presetName}.json`), JSON.stringify(preset, null, 2) + "\n");
console.log(`  ✓ preset written: ${presetName}.json (widgets: ${widgetTypes.join(", ")})`);

// ── Reload the running server so it picks up the new preset ──────────────────
// The server loads presets only at startup. Restart it in-place.
console.log(`▶ restarting widget-webhook server to load new preset…`);
spawnSync("bash", ["-lc", "lsof -ti :6767 | xargs kill 2>/dev/null; true"]);
await new Promise(r => setTimeout(r, 800));
const serverProc = spawnSync("bash", ["-lc",
  `cd ${REPO_ROOT}/src/widget-webhook-server && PORT=6767 CALLBACK_DELAY_MS=500 nohup node server.mjs > /tmp/widget-webhook.log 2>&1 &`
], { stdio: "inherit", detached: true });
await new Promise(r => setTimeout(r, 2000));

// Verify server is back up
try {
  const h = await axios.get(`http://localhost:6767/health`, { timeout: 3000 });
  if (!h.data.presets.includes(presetName)) throw new Error(`preset ${presetName} not loaded`);
  console.log(`  ✓ server up, ${h.data.presets.length} presets loaded`);
} catch (e) {
  console.error(`✗ server restart failed: ${e.message}`);
  process.exit(1);
}

// ── Step 2: Use create-scheduler.mjs to create the job ───────────────────────
// Build a temp config for this run
const ngrokUrl = existsSync(join(REPO_ROOT, ".ngrok-url")) ? readFileSync(join(REPO_ROOT, ".ngrok-url"), "utf8").trim() : null;
if (!ngrokUrl) {
  console.error("✗ .ngrok-url not found. Run `./scripts/start-demo.sh` first.");
  process.exit(1);
}
const tmpCfgPath = `/tmp/demo-run-${runN}.json`;
writeFileSync(tmpCfgPath, JSON.stringify({
  name: jobName,
  description: `Auto-demo: run #${runN}, preset ${presetName}, widgets: ${widgetTypes.join(", ")}.`,
  schedule: { dtstart: "20260101T000000Z", rrule: "FREQ=DAILY;COUNT=1" }, // placeholder; overridden by --schedule-in
  audience: { users: [audienceUserId], groups: [] },
  webhook: {
    publicBaseUrl: ngrokUrl,
    preset: presetName,
    processApiKey: "widget-webhook-secret",
    timeoutSeconds: 60,
  },
}, null, 2));

console.log(`▶ creating scheduled job (trigger in ${delay})…`);
const sch = spawnSync("node", [
  "scripts/create-scheduler.mjs",
  "--public-url", ngrokUrl,
  "--schedule-in", delay,
  tmpCfgPath,
], { cwd: REPO_ROOT, encoding: "utf8" });
if (sch.status !== 0) {
  console.error(sch.stdout, sch.stderr);
  process.exit(sch.status);
}
const jobIdMatch = sch.stdout.match(/jobId=([a-f0-9]{24})/);
if (!jobIdMatch) {
  console.error("✗ couldn't parse jobId from create-scheduler output\n" + sch.stdout);
  process.exit(1);
}
const jobId = jobIdMatch[1];
console.log(`  ✓ job created: ${jobId}`);

// ── Step 3: Wait for run-user to appear ──────────────────────────────────────
console.log(`▶ waiting for EkoAI to trigger + process (up to 6 min)…`);
let runUserId = null;
const waitUntil = Date.now() + 6 * 60 * 1000;
while (Date.now() < waitUntil) {
  await new Promise(r => setTimeout(r, 15_000));
  try {
    const runsRes = await axios.get(`${API_BASE}/v1/scheduled-jobs/${jobId}/runs?limit=1`, { headers: H, validateStatus: () => true });
    const runs = runsRes.data?.data || [];
    if (!runs.length) { process.stdout.write("."); continue; }
    const runId = runs[0].id;
    const rusRes = await axios.get(`${API_BASE}/v1/scheduled-jobs/${jobId}/runs/${runId}/run-users?limit=5`, { headers: H, validateStatus: () => true });
    const rus = rusRes.data?.data || [];
    const done = rus.find(u => ["SUCCESS", "FAILED", "FINISHED"].includes(u.status));
    if (done) { runUserId = done.id; console.log(`\n  ✓ run-user finished: ${runUserId} (status=${done.status})`); break; }
    if (rus.length) process.stdout.write(`[${rus[0].status[0]}]`);
  } catch {}
}
if (!runUserId) { console.error("\n✗ timed out waiting for run"); process.exit(1); }

// ── Step 4: Run verification ─────────────────────────────────────────────────
console.log(`\n▶ running 4-layer verification…`);
const verify = spawnSync("node", ["scripts/verify-delivery.mjs", jobId, runUserId], { cwd: REPO_ROOT, stdio: "inherit" });
const verdict = verify.status === 0 ? "PASS" : "FAIL (see layer details above)";

// ── Summary + Links ─────────────────────────────────────────────────────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  🎯 Demo Run #${runN} — ${verdict}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Job:       ${jobName}`);
console.log(`  Job ID:    ${jobId}`);
console.log(`  Run-user:  ${runUserId}`);
console.log(`  Preset:    ${presetName}.json`);
console.log(`  Widgets:   ${widgetTypes.join(", ")}`);
console.log(`  Console:   https://ekoai-console.staging.ekoapp.com/ai-task-scheduler/management/${jobId}`);
console.log(`  Preview:   http://localhost:6767/${presetName}/preview`);
console.log(`  Snapshot:  src/widget-webhook-server/snapshots/${runUserId}/`);
console.log(`  Verify:    node scripts/verify-delivery.mjs ${jobId} ${runUserId}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

process.exit(verify.status);
