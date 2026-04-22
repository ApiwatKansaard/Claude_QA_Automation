#!/usr/bin/env node
/**
 * Create a Scheduled Job via API end-to-end.
 *
 * Takes a simple config file and:
 *   1. POSTs /v1/scheduled-jobs to create the job
 *   2. POSTs /v1/scheduled-jobs/{id}/callback-api-key to get scbk_<key>
 *   3. Writes the key into the matching preset file so webhook server can use it
 *   4. Prints a summary (id, next run, webhook URL, preview URL)
 *
 * Config file shape (JSON):
 * {
 *   "name": "Morning Brief — QA Demo",
 *   "description": "Daily 09:00 brief sent via widget webhook",
 *   "schedule": { "dtstart": "20260422T020000Z", "rrule": "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" },
 *   "audience": { "users": ["60c1fa78e7c4f2711a5a2b57"], "groups": [] },
 *   "webhook": {
 *     "publicBaseUrl": "https://xxxx.ngrok-free.app",
 *     "preset": "sales-dashboard",
 *     "processApiKey": "my-webhook-secret",
 *     "timeoutSeconds": 60
 *   }
 * }
 *
 * Usage:
 *   node scripts/create-scheduler.mjs scripts/configs/demo.json
 *   node scripts/create-scheduler.mjs --copy-audience-from 69c4b33d1ab522e2844b247f scripts/configs/demo.json
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function popFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
const copyAudienceFromJobId = popFlag("--copy-audience-from");
const publicUrlArg = popFlag("--public-url");
const scheduleInArg = popFlag("--schedule-in"); // e.g. "2m" = run 2 minutes from now

const configPath = args[0];
if (!configPath) {
  console.error("Usage: node scripts/create-scheduler.mjs [options] <config.json>");
  console.error("");
  console.error("Options:");
  console.error("  --public-url <url>          Override webhook.publicBaseUrl (e.g. ngrok URL)");
  console.error("  --copy-audience-from <id>   Clone audience from an existing job");
  console.error("  --schedule-in <duration>    Schedule run N from now (e.g. 2m, 30s, 1h)");
  console.error("");
  console.error("Tip: if .ngrok-url exists in repo root (written by start-demo.sh),");
  console.error("     its URL is used automatically when --public-url is omitted.");
  process.exit(2);
}

const config = JSON.parse(readFileSync(resolve(configPath), "utf8"));

// ── Auto-pick ngrok URL if not explicit ───────────────────────────────────────
if (publicUrlArg) {
  config.webhook = config.webhook || {};
  config.webhook.publicBaseUrl = publicUrlArg;
} else {
  const ngrokFile = join(REPO_ROOT, ".ngrok-url");
  if (existsSync(ngrokFile)) {
    const url = readFileSync(ngrokFile, "utf8").trim();
    if (url && !config.webhook?.publicBaseUrl?.startsWith("https://")
        || config.webhook?.publicBaseUrl?.includes("placeholder")) {
      config.webhook = config.webhook || {};
      config.webhook.publicBaseUrl = url;
      console.log(`[url] picked up .ngrok-url → ${url}`);
    }
  }
}

// ── Optional: override schedule to fire soon ──────────────────────────────────
if (scheduleInArg) {
  const m = /^(\d+)([smh])$/.exec(scheduleInArg);
  if (!m) throw new Error(`--schedule-in must be like 2m, 30s, 1h (got ${scheduleInArg})`);
  const secs = parseInt(m[1], 10) * { s: 1, m: 60, h: 3600 }[m[2]];
  const fire = new Date(Date.now() + secs * 1000);
  const pad = n => String(n).padStart(2, "0");
  const dtstart =
    `${fire.getUTCFullYear()}${pad(fire.getUTCMonth() + 1)}${pad(fire.getUTCDate())}T` +
    `${pad(fire.getUTCHours())}${pad(fire.getUTCMinutes())}${pad(fire.getUTCSeconds())}Z`;
  config.schedule = {
    dtstart,
    rrule: `FREQ=MINUTELY;INTERVAL=${Math.max(1, Math.ceil(secs / 60))};COUNT=1`,
  };
  console.log(`[schedule] --schedule-in ${scheduleInArg} → dtstart=${dtstart} (≈ ${fire.toISOString()})`);
}

// ── Load env ──────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL || "https://ekoai.staging.ekoapp.com";
const AUTH_STATE = process.env.AUTH_STATE_PATH || join(REPO_ROOT, "playwright", ".auth", "staging-user.json");

function getIdToken() {
  if (!existsSync(AUTH_STATE)) throw new Error(`Auth state missing at ${AUTH_STATE}. Run: TEST_ENV=staging npx playwright test --project=setup`);
  const state = JSON.parse(readFileSync(AUTH_STATE, "utf8"));
  const cookie = (state.cookies || []).find(c => c.name.includes("idToken"));
  if (!cookie) throw new Error("No idToken cookie in auth state");
  return cookie.value;
}

const token = getIdToken();
const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// ── Resolve audience ──────────────────────────────────────────────────────────
let audience = config.audience;
if (copyAudienceFromJobId) {
  const res = await axios.get(`${API_BASE}/v1/scheduled-jobs/${copyAudienceFromJobId}`, { headers: authHeaders });
  audience = res.data.audience;
  console.log(`[audience] copied from job ${copyAudienceFromJobId}: users=${audience.users?.length ?? 0} groups=${audience.groups?.length ?? 0}`);
}
if (!audience || (!audience.users?.length && !audience.groups?.length)) {
  console.warn("⚠️  Audience is empty — job will trigger but no webhook will fire.");
  audience = audience || { users: [], groups: [] };
}

// ── Build process endpoint ────────────────────────────────────────────────────
const wh = config.webhook;
const presetPath = wh.preset ? `/${wh.preset}` : "";
const processEndpoint = wh.publicBaseUrl.replace(/\/$/, "") + presetPath;

// ── Build iCalendar ───────────────────────────────────────────────────────────
const { dtstart, rrule } = config.schedule;
if (!dtstart || !rrule) throw new Error("config.schedule needs {dtstart, rrule}");
const iCal = `DTSTART:${dtstart}\nRRULE:${rrule}`;

// ── Create job ────────────────────────────────────────────────────────────────
const payload = {
  name: config.name,
  description: config.description || "",
  step: {
    trigger: { iCalendarDefinition: iCal },
    process: {
      endpoint: processEndpoint,
      apiKey: wh.processApiKey || "widget-webhook-secret",
      timeoutSeconds: wh.timeoutSeconds ?? 60,
    },
    action: [{ type: "HOME_PAGE", schedule: { mode: "IMMEDIATE" } }],
  },
  audience,
};

console.log(`[create] POST ${API_BASE}/v1/scheduled-jobs`);
const createRes = await axios.post(`${API_BASE}/v1/scheduled-jobs`, payload, { headers: authHeaders, validateStatus: () => true });
if (createRes.status < 200 || createRes.status >= 300) {
  console.error(`[create FAILED] ${createRes.status}`, createRes.data);
  process.exit(1);
}
const job = createRes.data?.data ?? createRes.data;
const jobId = job.id || job._id;
console.log(`[create OK] jobId=${jobId}  nextRun=${job.step?.trigger?.nextRun ?? "(n/a)"}`);

// ── Generate callback API key ─────────────────────────────────────────────────
const keyRes = await axios.post(`${API_BASE}/v1/scheduled-jobs/${jobId}/callback-api-key`, {}, { headers: authHeaders, validateStatus: () => true });
if (keyRes.status < 200 || keyRes.status >= 300) {
  console.error(`[callback-api-key FAILED] ${keyRes.status}`, keyRes.data);
  process.exit(1);
}
const callbackApiKey = keyRes.data.apiKey;
console.log(`[callback-api-key] ${callbackApiKey}`);

// ── Write key into preset file ────────────────────────────────────────────────
if (wh.preset) {
  const presetFile = join(REPO_ROOT, "src", "widget-webhook-server", "presets", `${wh.preset}.json`);
  if (existsSync(presetFile)) {
    const preset = JSON.parse(readFileSync(presetFile, "utf8"));
    preset.callbackApiKey = callbackApiKey;
    writeFileSync(presetFile, JSON.stringify(preset, null, 2) + "\n");
    console.log(`[preset] wrote callbackApiKey into ${presetFile}`);
  } else {
    console.warn(`[preset] ${wh.preset}.json not found — the webhook server will need WEBHOOK_CALLBACK_API_KEY=${callbackApiKey} env var instead`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n────────────────────────────────────────────────");
console.log(`✅ Scheduled job created`);
console.log(`   id:           ${jobId}`);
console.log(`   name:         ${job.name}`);
console.log(`   nextRun:      ${job.step?.trigger?.nextRun ?? "(n/a)"}`);
console.log(`   audience:     users=${audience.users?.length ?? 0} groups=${audience.groups?.length ?? 0}`);
console.log(`   process URL:  ${processEndpoint}`);
console.log(`   webhook path: POST ${processEndpoint}/webhook  (x-api-key: ${wh.processApiKey || "widget-webhook-secret"})`);
console.log(`   callback key: ${callbackApiKey}`);
if (wh.preset) console.log(`   preview:      http://localhost:6767/${wh.preset}/preview`);
console.log(`   jira:         https://ekoai-console.staging.ekoapp.com/ai-task-scheduler/ai-task-scheduler/${jobId}`);
console.log("────────────────────────────────────────────────\n");
