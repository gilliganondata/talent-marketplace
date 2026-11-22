// public/assets/theme.js
//
// Reads window.SITE_CONFIG (set in site-config.js), resolves a complete set of
// design tokens, and applies them as CSS custom properties on the document
// root, so every page's stylesheet picks them up automatically. Load this
// AFTER site-config.js and BEFORE any visible content, so there's no flash of
// the wrong colors.
//
//   theme: "slate" | "ocean" | "forest" | "sunset" | "plum" | "midnight"
//   theme: "custom"  -> SITE_CONFIG.customTheme is merged over the preset
//                       named in customTheme.base (default "slate")
//   fontStylesheetUrl -> optional https URL of a stylesheet (e.g. Google
//                        Fonts) that is injected as a <link>
//
// Every token is always set: an invalid or missing value falls back to the
// base preset's value.

const THEME_FONT_STACK = "system-ui, -apple-system, sans-serif";

const THEMES = {
  slate: {
    bg: "#ffffff", surface: "#ffffff", text: "#1a1a1a", mutedText: "#595959",
    primary: "#1a1a1a", primaryText: "#ffffff", accentBg: "#f5f5f5", border: "#cccccc",
    link: "#0b57d0", focus: "#1a1a1a", danger: "#b00020",
    fontBody: THEME_FONT_STACK, fontDisplay: THEME_FONT_STACK, colorScheme: "light"
  },
  ocean: {
    bg: "#f7fbfd", surface: "#ffffff", text: "#0f2430", mutedText: "#4a5a63",
    primary: "#0f6e8c", primaryText: "#ffffff", accentBg: "#e6f4f8", border: "#bcdce6",
    link: "#0f6e8c", focus: "#0f6e8c", danger: "#b00020",
    fontBody: THEME_FONT_STACK, fontDisplay: THEME_FONT_STACK, colorScheme: "light"
  },
  forest: {
    bg: "#f7faf7", surface: "#ffffff", text: "#1c2a1c", mutedText: "#4a5a4a",
    primary: "#2f6b3a", primaryText: "#ffffff", accentBg: "#e7f2e8", border: "#c3dcc6",
    link: "#2f6b3a", focus: "#2f6b3a", danger: "#b00020",
    fontBody: THEME_FONT_STACK, fontDisplay: THEME_FONT_STACK, colorScheme: "light"
  },
  sunset: {
    bg: "#fffaf7", surface: "#ffffff", text: "#2a1a12", mutedText: "#5f4a3f",
    primary: "#b8431a", primaryText: "#ffffff", accentBg: "#fbe8de", border: "#f0c3ac",
    link: "#b8431a", focus: "#b8431a", danger: "#b00020",
    fontBody: THEME_FONT_STACK, fontDisplay: THEME_FONT_STACK, colorScheme: "light"
  },
  plum: {
    bg: "#faf7fb", surface: "#ffffff", text: "#241a2a", mutedText: "#5a4a63",
    primary: "#6b3f8c", primaryText: "#ffffff", accentBg: "#ede3f2", border: "#d6bfe6",
    link: "#6b3f8c", focus: "#6b3f8c", danger: "#b00020",
    fontBody: THEME_FONT_STACK, fontDisplay: THEME_FONT_STACK, colorScheme: "light"
  },
  midnight: {
    bg: "#0f1115", surface: "#181b21", text: "#e8eaed", mutedText: "#9aa0a6",
    primary: "#8ab4f8", primaryText: "#0f1115", accentBg: "#181b21", border: "#3a404a",
    link: "#8ab4f8", focus: "#8ab4f8", danger: "#f28b82",
    fontBody: THEME_FONT_STACK, fontDisplay: THEME_FONT_STACK, colorScheme: "dark"
  }
};

const COLOR_TOKENS = ["bg", "surface", "text", "mutedText", "primary", "primaryText", "accentBg", "border", "link", "focus", "danger"];
const FONT_TOKENS = ["fontBody", "fontDisplay"];

// Token name -> CSS custom property
const TOKEN_VARS = {
  bg: "--color-bg", surface: "--color-surface", text: "--color-text", mutedText: "--color-muted-text",
  primary: "--color-primary", primaryText: "--color-primary-text", accentBg: "--color-accent-bg",
  border: "--color-border", link: "--color-link", focus: "--color-focus", danger: "--color-danger",
  fontBody: "--font-body", fontDisplay: "--font-display"
};

function themeSupports(property, value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (typeof CSS !== "undefined" && CSS.supports) return CSS.supports(property, value);
  // No CSS engine (e.g. the Node contrast checker): accept hex colors only.
  return property === "color" ? /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim()) : true;
}

// Returns a complete token object for the given config. Never leaves a token unset.
function resolveTheme(config) {
  const cfg = config || {};
  const named = THEMES[cfg.theme];

  if (cfg.theme !== "custom") return Object.assign({}, named || THEMES.slate);

  const custom = cfg.customTheme && typeof cfg.customTheme === "object" ? cfg.customTheme : {};
  const resolved = Object.assign({}, THEMES[custom.base] || THEMES.slate);
  COLOR_TOKENS.forEach((k) => { if (themeSupports("color", custom[k])) resolved[k] = custom[k].trim(); });
  FONT_TOKENS.forEach((k) => { if (themeSupports("font-family", custom[k])) resolved[k] = custom[k].trim(); });
  if (custom.colorScheme === "light" || custom.colorScheme === "dark") resolved.colorScheme = custom.colorScheme;
  return resolved;
}

function applyTheme() {
  const config = window.SITE_CONFIG || {};
  const theme = resolveTheme(config);
  const root = document.documentElement.style;
  Object.keys(TOKEN_VARS).forEach((k) => root.setProperty(TOKEN_VARS[k], theme[k]));
  root.setProperty("color-scheme", theme.colorScheme);

  if (typeof config.fontStylesheetUrl === "string") {
    try {
      const url = new URL(config.fontStylesheetUrl);
      if (url.protocol === "https:") {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url.href;
        document.head.appendChild(link);
      }
    } catch (e) { /* invalid URL: ignore, system fonts still work */ }
  }
}

if (typeof document !== "undefined") applyTheme();
if (typeof module !== "undefined" && module.exports) module.exports = { THEMES, resolveTheme };
