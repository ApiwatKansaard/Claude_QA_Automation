# Widget Webhook Server

Multi-preset webhook server that implements the EkoAI Scheduled Job
**process endpoint** contract. On every webhook from EkoAI it composes HTML
from widget snippets and POSTs it back to the callback endpoint.

Together with [`scripts/create-scheduler.mjs`](../../scripts/create-scheduler.mjs),
this gives you a one-command way to stand up a complete scheduled-job demo.

## Architecture

```
EkoAI Scheduled Job                     Widget Webhook Server (this)           EkoAI Callback
─────────────────────                   ────────────────────────────           ──────────────
[trigger at cron]  ──POST /<preset>/webhook──►  [ack 200]
                                                    ↓ wait 2s
                                                    [compose HTML from preset]
                                                    ──POST /v1/scheduled-jobs/runs/callback──►  [stored + rendered on Eko homepage]
                                                        x-api-key: scbk_…
                                                        body: { id, homePage: { html, lang } }
```

## Layout

```
widget-webhook-server/
├── server.mjs          ← Express app (health, presets, preview, webhook)
├── lib/compose.mjs     ← widget stacker + HTML shell
├── widgets/            ← component snippets (Text, LineChart, Tabs, …)
├── presets/            ← named compositions (JSON) or raw HTML files
│   ├── default.json
│   ├── sales-dashboard.json
│   ├── simple-text.json
│   └── full-dashboard.html
└── package.json
```

## Start locally

```bash
cd src/widget-webhook-server
npm install
npm start                                # port 6767 (default)
# or with a different port / faster callback:
PORT=7000 CALLBACK_DELAY_MS=500 npm start
```

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | Liveness + list of loaded presets/widgets |
| GET  | `/presets` | Summary of every preset (title, widgetCount, hasApiKey, etc.) |
| GET  | `/:preset/preview` | Render the preset HTML in-browser (for iterating on the design) |
| POST | `/webhook` | Default preset — uses `presets/default.json` |
| POST | `/:preset/webhook` | Preset-specific webhook |

Each webhook request must carry a body like `{ "id": "<scheduleJobRunUserId>" }`
(sent by EkoAI). The server acks immediately with `{received: true}` then fires
the callback 2 seconds later (configurable via `CALLBACK_DELAY_MS`).

## Expose publicly (ngrok)

EkoAI runs on staging/prod and needs a public URL. Typical flow:

```bash
# Terminal 1
cd src/widget-webhook-server && npm start

# Terminal 2
ngrok http 6767
# copy the https URL
```

Paste the ngrok URL (plus preset path, e.g. `/sales-dashboard`) into the
**Custom webhook URL** field of the scheduled job in EkoAI Console. EkoAI
will append `/webhook` automatically per spec §4.

## Presets

**JSON preset** — composes HTML from the widget library:

```jsonc
// presets/sales-dashboard.json
{
  "title": "Sales Performance Dashboard",
  "lang": "en",
  "callbackApiKey": "scbk_…",         // optional; filled by create-scheduler.mjs
  "widgets": [
    { "type": "baseContainer", "title": "High-Level Insight" },
    { "type": "lineChart" },
    { "type": "miniTable" },
    { "type": "text", "title": "Action Items", "text": "…" }
  ]
}
```

**HTML preset** — served as-is (only `{{token}}` substitution):

```
presets/custom-page.html
```

Any `{{key}}` found in the HTML is replaced first by `preset.tokens` from the
JSON variant (if present), then left alone for EkoAI's own substitution
(`{{displayName}}`, `{{homePageUpdatedAtFormatted}}`, `{{networkThemeColor}}`,
see Tech Spec AE-14600).

### Available widgets

`text`, `lineChart`, `circular`, `carousel`, `collapsible`, `markdown`,
`miniTable`, `more1`, `more2`, `more3`, `selectTabs`, `tabs`, `tags`, `map`,
`baseContainer`

Check `GET /health` for the authoritative list at runtime.

## Callback authentication

Per Confluence 3528917005 §5.1, each scheduled job has its own
**callback API key** (prefix `scbk_`). The server picks it up in this order:

1. `preset.callbackApiKey` (written by `create-scheduler.mjs` after job creation)
2. `WEBHOOK_CALLBACK_API_KEY` env var (fallback, for dev/debug)

If neither is set, the webhook still acks 200 but the callback POST will log
an error — useful for smoke-testing the ack path without a real job.

## End-to-end with scripts/create-scheduler.mjs

See [../../scripts/create-scheduler.mjs](../../scripts/create-scheduler.mjs)
for the companion script that creates the scheduled job via API, generates
the callback API key, and wires it into the matching preset file.
