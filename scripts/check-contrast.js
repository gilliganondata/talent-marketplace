#!/usr/bin/env node
// scripts/check-contrast.js
//
// Zero-dependency WCAG contrast check for every preset in theme.js plus the
// theme configured in public/assets/site-config.js (including a "custom"
// theme). Run from the repo root:  node scripts/check-contrast.js
//
// Required pairs must reach 4.5:1 (the exit code is 1 if any fail). Other
// pairs are checked too, for text that actually appears on those backgrounds.
// Only #hex colors are checked; other CSS color formats are reported as skipped.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const publicAssets = path.join(__dirname, "..", "public", "assets");
const { THEMES, resolveTheme } = require(path.join(publicAssets, "theme.js"));

// Load site-config.js the way a browser would.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(publicAssets, "site-config.js"), "utf8"), sandbox);
const siteConfig = sandbox.window.SITE_CONFIG || {};

const PAIRS = [
  // [label, foreground token, background token, required?]
  ["text/bg", "text", "bg", true],
  ["mutedText/bg", "mutedText", "bg", true],
  ["mutedText/surface", "mutedText", "surface", true],
  ["link/bg", "link", "bg", true],
  ["primaryText/primary", "primaryText", "primary", true],
  ["danger/bg", "danger", "bg", true],
  ["danger/surface", "danger", "surface", true],
  ["text/surface", "text", "surface", false],
  ["link/surface", "link", "surface", false],
  ["mutedText/accentBg", "mutedText", "accentBg", false],
  ["primary/accentBg", "primary", "accentBg", false],
  ["text/accentBg", "text", "accentBg", false]
];

function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toCheck = Object.keys(THEMES).map((name) => [name, THEMES[name]]);
toCheck.push([`instance (theme: "${siteConfig.theme}")`, resolveTheme(siteConfig)]);

let failures = 0;
for (const [name, tokens] of toCheck) {
  console.log(`\n${name}`);
  for (const [label, fg, bg, required] of PAIRS) {
    if (![tokens[fg], tokens[bg]].every((v) => /^#[0-9a-f]{3,8}$/i.test(v))) {
      console.log(`  ${label.padEnd(22)} skipped (not a #hex color)`);
      continue;
    }
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= 4.5;
    if (!ok && required) failures++;
    console.log(`  ${label.padEnd(22)} ${r.toFixed(2).padStart(6)}  ${ok ? "pass" : required ? "FAIL" : "below 4.5 (not required)"}${required ? "" : "  [extra]"}`);
  }
}

console.log(failures ? `\n${failures} required pair(s) below 4.5:1` : "\nAll required pairs pass 4.5:1");
process.exit(failures ? 1 : 0);
