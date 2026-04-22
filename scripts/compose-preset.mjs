#!/usr/bin/env node
/**
 * Compose a new preset by mixing widget components.
 *
 * Every scheduled job created via create-scheduler.mjs should have its own
 * preset file so there's an audit trail of exactly what HTML was composed.
 *
 * Usage:
 *   node scripts/compose-preset.mjs <presetName> \
 *     --title "Sharp Test Morning Brief" \
 *     --widgets text,baseContainer,lineChart,miniTable,tabs,tags,collapsible,markdown \
 *     --text-title "Hello {{displayName}}" \
 *     --text-subtitle "Updated {{homePageUpdatedAtFormatted}}" \
 *     --text-content "Your custom morning brief text"
 *
 * Available widgets (see src/widget-webhook-server/lib/compose.mjs WIDGET_FILES):
 *   text, lineChart, circular, carousel, collapsible, markdown, miniTable,
 *   more1, more2, more3, selectTabs, tabs, tags, map, baseContainer
 *
 * Output: src/widget-webhook-server/presets/<presetName>.json
 */
import { writeFileSync, readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

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
const title = popFlag(args, "--title");
const widgetsArg = popFlag(args, "--widgets");
const lang = popFlag(args, "--lang") || "en";
const textTitle = popFlag(args, "--text-title");
const textSubtitle = popFlag(args, "--text-subtitle");
const textContent = popFlag(args, "--text-content");
const containerTitle = popFlag(args, "--container-title");
const containerSubtitle = popFlag(args, "--container-subtitle");

const presetName = args[0];

if (!presetName || !widgetsArg) {
  console.error("Usage: node scripts/compose-preset.mjs <name> --widgets <list> [options]");
  console.error("");
  console.error("Required:");
  console.error("  <name>                 Preset filename (without .json)");
  console.error("  --widgets <list>       Comma-separated widget names");
  console.error("");
  console.error("Common options:");
  console.error("  --title <str>          Page title (default: preset name)");
  console.error("  --lang en|th           Language tag (default: en)");
  console.error("  --text-title <str>     Override first 'text' widget's title");
  console.error("  --text-subtitle <str>  Override first 'text' widget's subtitle");
  console.error("  --text-content <str>   Override first 'text' widget's body text");
  console.error("  --container-title <str> Override 'baseContainer' widget's title");
  console.error("  --container-subtitle   Override 'baseContainer' widget's subtitle");
  console.error("");
  console.error("Available widgets: text lineChart circular carousel collapsible markdown");
  console.error("                   miniTable more1 more2 more3 selectTabs tabs tags map");
  console.error("                   baseContainer");
  process.exit(2);
}

const widgetNames = widgetsArg.split(",").map(s => s.trim()).filter(Boolean);

// Build widgets array, applying per-widget overrides the first time they appear
let textApplied = false, containerApplied = false;
const widgets = widgetNames.map((name) => {
  const w = { type: name };
  if (name === "text" && !textApplied) {
    if (textTitle != null) w.title = textTitle;
    if (textSubtitle != null) w.subtitle = textSubtitle;
    if (textContent != null) w.text = textContent;
    textApplied = true;
  }
  if (name === "baseContainer" && !containerApplied) {
    if (containerTitle != null) w.title = containerTitle;
    if (containerSubtitle != null) w.subtitle = containerSubtitle;
    containerApplied = true;
  }
  return w;
});

const preset = {
  title: title || presetName.replace(/[-_]/g, " "),
  lang,
  _generatedBy: "scripts/compose-preset.mjs",
  _generatedAt: new Date().toISOString(),
  widgets,
};

const outputPath = join(PRESETS_DIR, `${presetName}.json`);
writeFileSync(outputPath, JSON.stringify(preset, null, 2) + "\n");

console.log(`✓ Wrote preset: ${outputPath}`);
console.log(`  title:   ${preset.title}`);
console.log(`  widgets: ${widgets.length} (${widgetNames.join(", ")})`);
console.log(`  lang:    ${lang}`);
console.log(`  preview: http://localhost:6767/${presetName}/preview`);
