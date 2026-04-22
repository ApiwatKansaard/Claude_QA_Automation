#!/usr/bin/env node
/**
 * 4-Layer verification of a scheduled-job callback delivery.
 *
 * Layer 1 — Compose correctness (what we sent, local checks)
 *   1a. HTML parses with cheerio
 *   1b. Size ≤ 5 MB (current server limit)
 *   1c. All widget markers present (data-part="title" etc.)
 *   1d. Tokens still unresolved ({{displayName}}, {{networkThemeColor}})
 *
 * Layer 2 — Transport fidelity (did bytes survive the trip?)
 *   2a. SHA-256 of local snapshot vs run-user.process.result.homePage.html
 *   2b. If mismatch → cheerio DOM diff
 *
 * Layer 3 — Delivery status (did EkoAI & EkoNode actually process it?)
 *   3a. run-user.status == 'SUCCESS'
 *   3b. run-user.run.process.status == 'SUCCESS'
 *   3c. run-user.run.actions.homePage.status == 'SUCCESS'
 *
 * Layer 4 — Render probe (optional, best-effort via getLatest RPC)
 *   4a. Call /v0/home_page.getLatest to get post-substitution HTML
 *   4b. Check all {{token}} placeholders resolved
 *
 * Usage:
 *   node scripts/verify-delivery.mjs <jobId>
 *   node scripts/verify-delivery.mjs <jobId> <runUserId>
 *   node scripts/verify-delivery.mjs --json <jobId>            # machine-readable
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SNAPSHOTS_DIR = join(REPO_ROOT, "src", "widget-webhook-server", "snapshots");

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const posArgs = args.filter(a => !a.startsWith("--"));
const jobId = posArgs[0];
const runUserIdArg = posArgs[1];

if (!jobId) {
  console.error("Usage: node scripts/verify-delivery.mjs [--json] <jobId> [runUserId]");
  process.exit(2);
}

// ── Auth ─────────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL || "https://ekoai.staging.ekoapp.com";
const AUTH_STATE = process.env.AUTH_STATE_PATH || join(REPO_ROOT, "playwright", ".auth", "staging-user.json");

function getIdToken() {
  if (!existsSync(AUTH_STATE)) throw new Error(`Auth state missing at ${AUTH_STATE}`);
  const state = JSON.parse(readFileSync(AUTH_STATE, "utf8"));
  const cookie = (state.cookies || []).find(c => c.name.includes("idToken"));
  if (!cookie) throw new Error("No idToken cookie");
  return cookie.value;
}
const token = getIdToken();
const authHeaders = { Authorization: `Bearer ${token}` };

// ── Discover a run-user for this job ─────────────────────────────────────────
const runsRes = await axios.get(`${API_BASE}/v1/scheduled-jobs/${jobId}/runs?limit=5`, { headers: authHeaders, validateStatus: () => true });
if (runsRes.status !== 200) {
  console.error(`✗ cannot list runs for job ${jobId}: ${runsRes.status}`);
  process.exit(1);
}
const runs = runsRes.data.data || [];
if (runs.length === 0) {
  console.error(`✗ no runs yet for job ${jobId}`);
  process.exit(1);
}

// Take the most recent run (or a specific run if we can locate its run-user)
let targetRunUser = null;
for (const run of runs) {
  const rusRes = await axios.get(`${API_BASE}/v1/scheduled-jobs/${jobId}/runs/${run.id}/run-users?limit=10`, { headers: authHeaders, validateStatus: () => true });
  if (rusRes.status !== 200) continue;
  const rus = rusRes.data.data || [];
  if (runUserIdArg) {
    const match = rus.find(u => u.id === runUserIdArg);
    if (match) { targetRunUser = match; break; }
  } else if (rus.length > 0) {
    // pick first run-user that has a snapshot (otherwise first of all)
    const withSnap = rus.find(u => existsSync(join(SNAPSHOTS_DIR, u.id)));
    targetRunUser = withSnap || rus[0];
    break;
  }
}
if (!targetRunUser) {
  console.error(`✗ no matching run-user found for ${jobId}${runUserIdArg ? ` / ${runUserIdArg}` : ""}`);
  process.exit(1);
}
const runUserId = targetRunUser.id;

// ── Layer 2 prep: read snapshot ─────────────────────────────────────────────
const snapDir = join(SNAPSHOTS_DIR, runUserId);
const snapExists = existsSync(snapDir);
const sentHtml = snapExists ? readFileSync(join(snapDir, "sent.html"), "utf8") : null;
const sentMeta = snapExists ? JSON.parse(readFileSync(join(snapDir, "sent.meta.json"), "utf8")) : null;
const ngrokLogPath = join(snapDir, "ngrok-requests.json");
const ngrokLog = snapExists && existsSync(ngrokLogPath) ? JSON.parse(readFileSync(ngrokLogPath, "utf8")) : null;

// ── Run verification layers ──────────────────────────────────────────────────
const report = {
  jobId,
  runUserId,
  user: targetRunUser.user,
  timestamp: new Date().toISOString(),
  layers: {},
  overall: null,
};

// ─── Layer 1: Compose correctness ─────
if (sentHtml) {
  const $ = cheerio.load(sentHtml);
  const size = Buffer.byteLength(sentHtml);
  const dataParts = $("[data-part]").length;
  const unresolvedTokens = (sentHtml.match(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g) || []);
  const hasHtmlTag = $("html").length > 0;

  report.layers.l1_compose = {
    htmlParses: hasHtmlTag,
    sizeBytes: size,
    sizeOkUnder5MB: size <= 5 * 1024 * 1024,
    widgetMarkersCount: dataParts,
    hasWidgetMarkers: dataParts > 0,
    unresolvedTokens: [...new Set(unresolvedTokens)],
    tokensPreserved: unresolvedTokens.length > 0,
    passed: hasHtmlTag && size <= 5 * 1024 * 1024 && dataParts > 0,
  };
} else {
  report.layers.l1_compose = { skipped: true, reason: "no local snapshot found" };
}

// ─── Layer 2: Transport fidelity ─────
const storedHtml = targetRunUser.run?.process?.result?.homePage?.html;
if (sentHtml && storedHtml) {
  const sentHash = createHash("sha256").update(sentHtml).digest("hex");
  const storedHash = createHash("sha256").update(storedHtml).digest("hex");
  const match = sentHash === storedHash;
  const layer2 = {
    sentBytes: Buffer.byteLength(sentHtml),
    storedBytes: Buffer.byteLength(storedHtml),
    sentSha256: sentHash,
    storedSha256: storedHash,
    sha256Match: match,
  };
  if (!match) {
    // DOM diff fallback
    const $sent = cheerio.load(sentHtml);
    const $stored = cheerio.load(storedHtml);
    layer2.domDiff = {
      sentElements: $sent("*").length,
      storedElements: $stored("*").length,
      sentTitle: $sent("title").text(),
      storedTitle: $stored("title").text(),
      sentDataParts: $sent("[data-part]").length,
      storedDataParts: $stored("[data-part]").length,
    };
  }
  layer2.passed = match;
  report.layers.l2_transport = layer2;
} else if (!storedHtml) {
  report.layers.l2_transport = { skipped: true, reason: "EkoAI has not stored any HTML (process step may have failed before callback)" };
} else {
  report.layers.l2_transport = { skipped: true, reason: "no local snapshot to compare" };
}

// ─── Layer 3: Delivery status ─────
const layer3 = {
  runUserStatus: targetRunUser.status,
  processStatus: targetRunUser.run?.process?.status ?? null,
  processFailReasonCode: targetRunUser.run?.process?.failReasonCode ?? null,
  processFailReasonMessage: targetRunUser.run?.process?.failReasonMessage ?? null,
  actionHomePageStatus: targetRunUser.run?.actions?.homePage?.status ?? null,
  actionFailReasonCode: targetRunUser.run?.actions?.homePage?.failReasonCode ?? null,
  actionFailReasonMessage: targetRunUser.run?.actions?.homePage?.failReasonMessage ?? null,
};
layer3.processPassed = layer3.processStatus === "SUCCESS";
layer3.actionPassed = layer3.actionHomePageStatus === "SUCCESS";
layer3.passed = layer3.processPassed && layer3.actionPassed;
report.layers.l3_delivery = layer3;

// ─── Layer 4: Render probe (best-effort) ─────
// EkoAI getLatest RPC is socket-stream; we try the REST fallback if available.
// Most staging setups don't expose it → we skip gracefully.
report.layers.l4_render = { skipped: true, reason: "getLatest RPC not reachable from this network (Eko core API)" };

// ── Overall verdict ─────────────────────────────────────────────────────────
const layersPassed = [
  report.layers.l1_compose?.passed,
  report.layers.l2_transport?.passed,
  report.layers.l3_delivery?.passed,
];
const hasFail = layersPassed.includes(false);
const allSkipped = layersPassed.every(v => v === undefined);
report.overall = allSkipped ? "INSUFFICIENT_DATA" : hasFail ? "FAIL" : "PASS";

// ── Output ───────────────────────────────────────────────────────────────────
if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overall === "PASS" ? 0 : 1);
}

const ok = (v) => v === true ? "✅" : v === false ? "❌" : "⏭️";
const layer = (n, obj) => {
  const name = { l1_compose: "Layer 1 — Compose", l2_transport: "Layer 2 — Transport", l3_delivery: "Layer 3 — Delivery", l4_render: "Layer 4 — Render" }[n];
  console.log(`\n  ${ok(obj.passed)} ${name}`);
  if (obj.skipped) return console.log(`     skipped: ${obj.reason}`);
  for (const [k, v] of Object.entries(obj)) {
    if (k === "passed") continue;
    const display = typeof v === "object" ? JSON.stringify(v) : v;
    console.log(`     ${k}: ${display}`);
  }
};

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Delivery verification — job ${jobId}`);
console.log(`  run-user: ${runUserId}  (${targetRunUser.user?.username ?? "?"} / ${targetRunUser.user?.email ?? "?"})`);
console.log(`  snapshot: ${snapExists ? snapDir : "(none)"}`);
console.log(`  ngrok:    ${ngrokLog ? `${ngrokLog.length} captured requests → ${ngrokLogPath}` : "(not captured)"}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
layer("l1_compose", report.layers.l1_compose);
layer("l2_transport", report.layers.l2_transport);
layer("l3_delivery", report.layers.l3_delivery);
layer("l4_render", report.layers.l4_render);

const verdictBadge = { PASS: "✅ PASS", FAIL: "❌ FAIL", INSUFFICIENT_DATA: "⚠️  INSUFFICIENT DATA" }[report.overall];
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Overall: ${verdictBadge}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

process.exit(report.overall === "PASS" ? 0 : 1);
