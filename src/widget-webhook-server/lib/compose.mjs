/**
 * HTML composer: build a full dashboard page from a preset config.
 *
 * A preset is either:
 *  - A raw .html file (served as-is, only {{placeholder}} substitution)
 *  - A .json config that lists widgets to stack into a shell template
 *
 * Widget snippets in `widgets/` are assembled under a minimal HTML shell
 * that loads Chart.js, Alpine.js, Tailwind CDN, and Font Awesome so they
 * render correctly in the Eko homepage renderer.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIDGETS_DIR = join(__dirname, "..", "widgets");

/** Logical name → filename under `widgets/`. */
const WIDGET_FILES = {
  text:         "TextComponent.html",
  lineChart:    "LineChartComponent.html",
  circular:     "CurcularProgressComponent.html",
  carousel:     "CarouselComponent.html",
  collapsible:  "CollapsibleComponent.html",
  markdown:     "MarkdownComponent.html",
  miniTable:    "MiniTableComponent.html",
  more1:        "MoreComponent-1level.html",
  more2:        "MoreComponent-2level.html",
  more3:        "MoreComponent-3level.html",
  selectTabs:   "SelectTabsComponent.html",
  tabs:         "TabSwitcherComponent.html",
  tags:         "TagsComponent.html",
  map:          "MapComponent.html",
  baseContainer:"BaseContainderComponent.html",
};

export function listAvailableWidgets() {
  return Object.keys(WIDGET_FILES);
}

function loadWidget(widget) {
  const name = typeof widget === "string" ? widget : widget.type;
  const file = WIDGET_FILES[name];
  if (!file) return `<!-- unknown widget: ${name} -->`;
  const path = join(WIDGETS_DIR, file);
  if (!existsSync(path)) return `<!-- widget file missing: ${file} -->`;
  let html = readFileSync(path, "utf8");

  // Optional per-widget overrides for simple title/subtitle/text replacement
  if (typeof widget === "object") {
    if (widget.title != null) {
      html = html.replace(/(data-part="title"[^>]*>)[^<]*/m, `$1${esc(widget.title)}`);
    }
    if (widget.subtitle != null) {
      html = html.replace(/(data-part="subtitle"[^>]*>)[^<]*/m, `$1${esc(widget.subtitle)}`);
    }
    if (widget.text != null) {
      html = html.replace(/(data-part="text"[^>]*>)[^<]*/m, `$1${esc(widget.text)}`);
    }
  }
  return html;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/**
 * Return a full HTML document from a preset config.
 * Supports either a raw .html file or a JSON preset object.
 */
export function composeFromPreset(preset) {
  if (preset.html) {
    // Raw HTML passthrough (from loaded .html file)
    return applyTokens(preset.html, preset.tokens);
  }
  const widgets = preset.widgets || [];
  const body = widgets.map(loadWidget).join("\n");
  return applyTokens(htmlShell(preset.title || "Dashboard", body, preset), preset.tokens);
}

function applyTokens(html, tokens = {}) {
  // Replace {{key}} tokens; unknown tokens are left as-is for EkoAI's own substitution
  // (e.g. {{displayName}}, {{homePageUpdatedAtFormatted}}, {{networkThemeColor}})
  for (const [k, v] of Object.entries(tokens)) {
    html = html.replaceAll(`{{${k}}}`, String(v));
  }
  return html;
}

function htmlShell(title, body, preset) {
  const primary = preset.primaryColor || "{{networkThemeColor}}";
  return `<!doctype html>
<html lang="${preset.lang || "en"}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/embla-carousel@8/embla-carousel.umd.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    :root {
      --color-primary: ${primary};
      --color-gray-1: #1a1a1a;
      --color-gray-5: #666;
      --color-gray-6: #999;
    }
    .clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .radial-corner { inset: 0; background: radial-gradient(circle at top right, rgba(var(--color-primary), 0.15), transparent 50%); }
  </style>
</head>
<body class="bg-gray-50 p-4 max-w-3xl mx-auto">
  <h1 class="text-2xl font-bold mb-4 text-[var(--color-gray-1)]">${esc(title)}</h1>
  <div class="space-y-4">
${body}
  </div>
  <script>
    // Auto-init Chart.js for [data-chart-line] canvases
    document.querySelectorAll("[data-chart-line-card]").forEach(card => {
      const cfg = card.querySelector("[data-chart-line-config]")?.textContent;
      const canvas = card.querySelector("[data-chart-line]");
      if (cfg && canvas && window.Chart) {
        const c = JSON.parse(cfg);
        new Chart(canvas, { type: c.type, data: { labels: c.labels, datasets: c.datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
      }
    });
  </script>
</body>
</html>`;
}
