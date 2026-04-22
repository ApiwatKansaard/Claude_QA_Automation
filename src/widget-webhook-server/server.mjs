#!/usr/bin/env node
/**
 * Widget Webhook Server
 *
 * A multi-preset HTTP server that implements the EkoAI Scheduled Job
 * "process endpoint" contract (per Confluence 3528917005):
 *
 *   GET  /health                  → liveness check
 *   GET  /presets                 → list registered presets
 *   GET  /:preset/preview         → render preset HTML in-browser
 *   POST /webhook                 → default preset (backward-compatible)
 *   POST /:preset/webhook         → preset-specific webhook
 *
 * On webhook POST from EkoAI:
 *   1. ack immediately (`{ received: true }`, HTTP 200)
 *   2. wait CALLBACK_DELAY_MS (simulated processing)
 *   3. POST composed HTML to /v1/scheduled-jobs/runs/callback with x-api-key
 *
 * Presets live under `presets/`:
 *   - `<name>.json` → composition config (widget stack + callback key)
 *   - `<name>.html` → raw HTML (passed through with {{token}} substitution)
 *
 * Each preset can declare its own `callbackApiKey` (scbk_...) so one
 * server instance can serve many scheduled jobs. Fallback: env var
 * `WEBHOOK_CALLBACK_API_KEY`.
 */
import express from "express";
import axios from "axios";
import { createHash } from "crypto";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { composeFromPreset, listAvailableWidgets } from "./lib/compose.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "presets");
const SNAPSHOTS_DIR = join(__dirname, "snapshots");
if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || "https://ekoai.staging.ekoapp.com";
const CALLBACK_PATH = "/v1/scheduled-jobs/runs/callback";
const CALLBACK_DELAY_MS = parseInt(process.env.CALLBACK_DELAY_MS || "2000", 10);
const DEFAULT_CALLBACK_API_KEY = process.env.WEBHOOK_CALLBACK_API_KEY || "";

// ── Load presets from disk (hot-reloaded on every webhook to pick up late-added api keys) ──
function loadPresets() {
  const map = {};
  for (const file of readdirSync(PRESETS_DIR)) {
    if (file.startsWith(".")) continue;
    const [name, ext] = [file.replace(/\.(json|html?)$/i, ""), file.split(".").pop()];
    if (ext === "json") {
      map[name] = JSON.parse(readFileSync(join(PRESETS_DIR, file), "utf8"));
    } else if (ext === "html" || ext === "htm") {
      map[name] = {
        title: name.replace(/[-_]/g, " "),
        html: readFileSync(join(PRESETS_DIR, file), "utf8"),
      };
    }
  }
  return map;
}
let presets = loadPresets();

console.log(`[server] Loaded ${Object.keys(presets).length} presets: ${Object.keys(presets).join(", ") || "(none)"}`);
console.log(`[server] Callback target: ${CALLBACK_BASE_URL}${CALLBACK_PATH}`);

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "5mb" }));

// EkoAI health-check: spec §6 calls GET {process_step_endpoint}/health before each run.
// Our process_step_endpoint is <base>/<preset>, so EkoAI calls /<preset>/health.
// We register both the bare /health (server-wide liveness) and /:preset/health.
function healthHandler(req, res) {
  res.json({
    status: "ok",
    presets: Object.keys(presets),
    widgets: listAvailableWidgets(),
    callbackTarget: `${CALLBACK_BASE_URL}${CALLBACK_PATH}`,
  });
}
app.get("/health", healthHandler);
app.get("/:preset/health", (req, res) => {
  if (!presets[req.params.preset]) return res.status(404).json({ error: `preset '${req.params.preset}' not found` });
  return healthHandler(req, res);
});

app.get("/presets", (req, res) => {
  const summary = Object.fromEntries(
    Object.entries(presets).map(([k, p]) => [
      k,
      {
        title: p.title || k,
        lang: p.lang || "en",
        hasWidgets: Array.isArray(p.widgets),
        widgetCount: p.widgets?.length ?? 0,
        isRawHtml: Boolean(p.html),
        hasApiKey: Boolean(p.callbackApiKey),
      },
    ])
  );
  res.json(summary);
});

app.get("/:preset/preview", (req, res) => {
  const preset = presets[req.params.preset];
  if (!preset) return res.status(404).json({ error: `preset '${req.params.preset}' not found` });
  res.type("html").send(composeFromPreset(preset));
});

async function sendCallback(presetName, id) {
  // Hot-reload presets from disk so late-added callbackApiKey is picked up
  presets = loadPresets();
  const preset = presets[presetName];
  if (!preset) throw new Error(`preset '${presetName}' not found`);

  const apiKey = preset.callbackApiKey || DEFAULT_CALLBACK_API_KEY;
  if (!apiKey) throw new Error(`no callbackApiKey for preset '${presetName}' (set in preset or WEBHOOK_CALLBACK_API_KEY env)`);

  const html = composeFromPreset(preset);
  const sha256 = createHash("sha256").update(html).digest("hex");
  console.log(`[webhook→callback] preset=${presetName} id=${id} htmlLen=${html.length} sha256=${sha256.slice(0,16)}…`);

  // ── Write snapshot (Layer 2 prerequisite: byte-exact record of what we sent) ──
  const snapDir = join(SNAPSHOTS_DIR, id);
  if (!existsSync(snapDir)) mkdirSync(snapDir, { recursive: true });
  writeFileSync(join(snapDir, "sent.html"), html);
  const meta = {
    id,
    preset: presetName,
    presetTitle: preset.title,
    lang: preset.lang || "en",
    htmlBytes: Buffer.byteLength(html),
    sha256,
    sentAt: new Date().toISOString(),
    callbackEndpoint: `${CALLBACK_BASE_URL}${CALLBACK_PATH}`,
    callbackApiKeyPrefix: apiKey.slice(0, 12) + "…", // don't leak full key
    widgets: preset.widgets || null,
  };

  const res = await axios.post(
    `${CALLBACK_BASE_URL}${CALLBACK_PATH}`,
    { id, homePage: { html, lang: preset.lang || "en" } },
    { headers: { "x-api-key": apiKey, "Content-Type": "application/json" }, timeout: 30_000, validateStatus: () => true }
  );
  meta.callbackResponseStatus = res.status;
  meta.callbackResponseBody = res.data;
  writeFileSync(join(snapDir, "sent.meta.json"), JSON.stringify(meta, null, 2));
  console.log(`[webhook→callback] response ${res.status} ${JSON.stringify(res.data)}`);
  console.log(`[snapshot] wrote ${snapDir}/sent.{html,meta.json}`);

  // ── Capture ngrok inspector log (best-effort) ──────────────────────────────
  // Every request EkoAI sent through the ngrok tunnel (webhook, health check)
  // is recorded in the ngrok local API. Grab the ones whose body mentions this
  // run-user id and save alongside the HTML snapshot so developers have full
  // request/response headers + bodies for debugging when things go wrong.
  try {
    const NGROK_API = process.env.NGROK_API_URL || "http://localhost:4040";
    const ngrokRes = await axios.get(`${NGROK_API}/api/requests/http`, { timeout: 3000, validateStatus: () => true });
    const all = ngrokRes.data?.requests || [];

    // ngrok stores request.raw + response.raw as base64-encoded full HTTP messages.
    // Decode before filtering and annotate records so logs are human-readable.
    const decodeB64 = (s) => { try { return Buffer.from(s || "", "base64").toString("utf8"); } catch { return ""; } };
    const decorated = all.map(r => ({
      ...r,
      request_decoded: decodeB64(r.request?.raw),
      response_decoded: decodeB64(r.response?.raw),
    }));
    const relevant = decorated.filter(r => (r.request_decoded || "").includes(id));

    if (relevant.length) {
      writeFileSync(join(snapDir, "ngrok-requests.json"), JSON.stringify(relevant, null, 2));
      console.log(`[ngrok] captured ${relevant.length} request(s) for id=${id}`);
    } else {
      // Fallback: save recent decoded entries for manual inspection
      const recent = decorated.slice(0, 5);
      if (recent.length) {
        writeFileSync(join(snapDir, "ngrok-requests.recent.json"), JSON.stringify(recent, null, 2));
        console.log(`[ngrok] no id match; saved ${recent.length} most-recent (decoded) instead`);
      }
    }
  } catch (e) {
    console.warn(`[ngrok] inspector not reachable (${e.code || e.message}) — skipped log capture`);
  }
}

function handleWebhook(presetName) {
  return (req, res) => {
    const { id } = req.body ?? {};
    console.log(`[webhook] preset=${presetName} id=${id}`);
    if (!id) return res.status(400).json({ error: "id required in request body" });
    res.json({ received: true }); // ack fast per EkoAI contract (< 10s)
    setTimeout(
      () => sendCallback(presetName, id).catch(e => console.error("[callback ERROR]", e?.response?.data || e.message)),
      CALLBACK_DELAY_MS
    );
  };
}

app.post("/:preset/webhook", (req, res) => {
  const name = req.params.preset;
  if (!presets[name]) return res.status(404).json({ error: `preset '${name}' not found` });
  return handleWebhook(name)(req, res);
});

app.post("/webhook", (req, res) => {
  if (!presets.default) return res.status(404).json({ error: "default preset not configured" });
  return handleWebhook("default")(req, res);
});

const port = parseInt(process.env.PORT || "6767", 10);
app.listen(port, () => {
  console.log(`[server] Widget webhook server on http://localhost:${port}`);
  console.log(`[server] Preview any preset at http://localhost:${port}/<preset>/preview`);
});
