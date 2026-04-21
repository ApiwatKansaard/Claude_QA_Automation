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
import { readFileSync, readdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { composeFromPreset, listAvailableWidgets } from "./lib/compose.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "presets");

const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || "https://ekoai.staging.ekoapp.com";
const CALLBACK_PATH = "/v1/scheduled-jobs/runs/callback";
const CALLBACK_DELAY_MS = parseInt(process.env.CALLBACK_DELAY_MS || "2000", 10);
const DEFAULT_CALLBACK_API_KEY = process.env.WEBHOOK_CALLBACK_API_KEY || "";

// ── Load all presets at startup ──────────────────────────────────────────────
const presets = {};
for (const file of readdirSync(PRESETS_DIR)) {
  if (file.startsWith(".")) continue;
  const [name, ext] = [file.replace(/\.(json|html?)$/i, ""), file.split(".").pop()];
  if (ext === "json") {
    presets[name] = JSON.parse(readFileSync(join(PRESETS_DIR, file), "utf8"));
  } else if (ext === "html" || ext === "htm") {
    presets[name] = {
      title: name.replace(/[-_]/g, " "),
      html: readFileSync(join(PRESETS_DIR, file), "utf8"),
    };
  }
}

console.log(`[server] Loaded ${Object.keys(presets).length} presets: ${Object.keys(presets).join(", ") || "(none)"}`);
console.log(`[server] Callback target: ${CALLBACK_BASE_URL}${CALLBACK_PATH}`);

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    presets: Object.keys(presets),
    widgets: listAvailableWidgets(),
    callbackTarget: `${CALLBACK_BASE_URL}${CALLBACK_PATH}`,
  });
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
  const preset = presets[presetName];
  if (!preset) throw new Error(`preset '${presetName}' not found`);

  const apiKey = preset.callbackApiKey || DEFAULT_CALLBACK_API_KEY;
  if (!apiKey) throw new Error(`no callbackApiKey for preset '${presetName}' (set in preset or WEBHOOK_CALLBACK_API_KEY env)`);

  const html = composeFromPreset(preset);
  console.log(`[webhook→callback] preset=${presetName} id=${id} htmlLen=${html.length}`);

  const res = await axios.post(
    `${CALLBACK_BASE_URL}${CALLBACK_PATH}`,
    { id, homePage: { html, lang: preset.lang || "en" } },
    { headers: { "x-api-key": apiKey, "Content-Type": "application/json" }, timeout: 30_000, validateStatus: () => true }
  );
  console.log(`[webhook→callback] response ${res.status} ${JSON.stringify(res.data)}`);
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
